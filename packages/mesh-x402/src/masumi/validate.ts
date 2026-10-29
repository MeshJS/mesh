/**
 * Pure (non-cryptographic, non-chain) validation of `masumi` `PaymentRequirements`, shared by
 * the client (before it signs) and the facilitator (before it settles) so the two cannot
 * drift: closed-object schemas, wire formats, commitment digests, deployment parameters,
 * identity claim, compatibility identifier and the deadline ordering.
 *
 * Seller COSE verification lives in `cose.ts`, escrow-address derivation in
 * `escrow-address.ts`; both are composed by `validateMasumiRequirementsFull` below.
 */
import {
  isCanonicalAsset,
  LOVELACE,
  parsePositiveAmount,
} from "../types/asset";
import { X402ErrorCode } from "../types/errors";
import { addressMatchesNetwork } from "../types/network";
import {
  MAX_L1_CONFIRMATIONS,
  MIN_L1_CONFIRMATIONS,
  PaymentRequirements,
  PaymentRequirementsExtraMasumi,
  ResourceInfo,
} from "../types/payment-requirements";
import { masumiDeadlineIntervalsHold } from "./constants";
import { verifySellerTermsSignature } from "./cose";
import { addressCredentials } from "./datum";
import { masumiEscrowAddress, resolveMasumiDeployment } from "./escrow-address";
import { expectedBlockchainIdentifier } from "./identifier";
import {
  buildSignedTerms,
  commitmentPartDigest,
  computeInputHash,
  computeTermsDigest,
} from "./terms";

/** The global Masumi V2 registry policy ID every non-empty `agentIdentifier` must start with. */
export const MASUMI_V2_REGISTRY_POLICY_ID =
  "67ab0c92c4ac1610895a1c965ee50aba41a8f1513b15240723b3bd0b";

export type MasumiValidationFailure = { code: X402ErrorCode; detail: string };

const EXTRA_KEYS = [
  "assetTransferMethod",
  "confirmationPolicy",
  "areFeesSponsored",
  "inputCommitment",
  "terms",
  "referenceKey",
  "referenceSignature",
  "blockchainIdentifier",
  "deployment",
];
const COMMITMENT_KEYS = ["version", "algorithm", "parts", "digest"];
const PART_KEYS = [
  "name",
  "canonicalization",
  "mediaType",
  "content",
  "digest",
];
const TERMS_REQUIRED = [
  "version",
  "paymentType",
  "sellerAddress",
  "sellerNonce",
  "buyerNonce",
  "inputHash",
  "payByTime",
  "submitResultTime",
  "unlockTime",
  "externalDisputeUnlockTime",
];
const TERMS_KEYS = [
  ...TERMS_REQUIRED,
  "sellerReturnAddress",
  "agentIdentifier",
];
const DEPLOYMENT_KEYS = ["requiredAdmins", "adminVkeys", "cooldownPeriod"];

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Closed-object check: every key is allowed, and every `required` key is present. */
const closed = (
  obj: unknown,
  allowed: string[],
  required: string[],
  name: string,
): string | null => {
  if (!isObject(obj)) return `${name} must be an object`;
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) return `${name} has unknown field "${key}"`;
  }
  for (const key of required) {
    if (obj[key] === undefined) return `${name} is missing "${key}"`;
  }
  return null;
};

const LOWER_HEX_EVEN = /^([0-9a-f]{2})+$/;
const POSITIVE_MS = /^[1-9][0-9]*$/;
const NON_NEGATIVE_INT = /^(0|[1-9][0-9]*)$/;

const fail = (
  code: X402ErrorCode,
  detail: string,
): MasumiValidationFailure => ({ code, detail });

/**
 * Structural + format validation. Returns the first violation, or `null` when the
 * requirements are well-formed. `requirements.extra` is `unknown`-typed on purpose: this
 * runs on untrusted, possibly malformed JSON.
 */
export const validateMasumiRequirementsShape = (
  requirements: PaymentRequirements,
): MasumiValidationFailure | null => {
  const extra = requirements.extra as unknown;

  const extraErr = closed(
    extra,
    EXTRA_KEYS,
    [
      "inputCommitment",
      "terms",
      "referenceKey",
      "referenceSignature",
      "blockchainIdentifier",
    ],
    "extra",
  );
  if (extraErr) return fail("MASUMI_UNKNOWN_FIELD", extraErr);
  const e = extra as PaymentRequirementsExtraMasumi;

  if (e.assetTransferMethod !== "masumi")
    return fail("MASUMI_INVALID_FIELD", "assetTransferMethod must be masumi");
  if (e.areFeesSponsored !== undefined && e.areFeesSponsored !== false) {
    return fail(
      "MASUMI_INVALID_FIELD",
      "areFeesSponsored must be false when present",
    );
  }
  if (e.confirmationPolicy !== undefined) {
    const err = closed(
      e.confirmationPolicy,
      ["l1Confirmations"],
      ["l1Confirmations"],
      "confirmationPolicy",
    );
    if (err) return fail("MASUMI_UNKNOWN_FIELD", err);
    const n = e.confirmationPolicy.l1Confirmations;
    if (
      !Number.isInteger(n) ||
      n < MIN_L1_CONFIRMATIONS ||
      n > MAX_L1_CONFIRMATIONS
    ) {
      return fail(
        "MASUMI_INVALID_FIELD",
        "confirmationPolicy.l1Confirmations must be an integer from -1 to 20",
      );
    }
  }

  if (parsePositiveAmount(requirements.amount) === null)
    return fail(
      "MASUMI_INVALID_FIELD",
      "amount must be a positive canonical decimal string",
    );
  if (!isCanonicalAsset(requirements.asset))
    return fail(
      "MASUMI_INVALID_FIELD",
      "asset must be lovelace or canonical policyId.assetNameHex",
    );

  for (const field of [
    "referenceKey",
    "referenceSignature",
    "blockchainIdentifier",
  ] as const) {
    if (typeof e[field] !== "string" || !LOWER_HEX_EVEN.test(e[field]!)) {
      return fail(
        "MASUMI_INVALID_FIELD",
        `${field} must be lowercase even-length hex`,
      );
    }
  }

  // --- inputCommitment ---
  const c = e.inputCommitment!;
  const cErr = closed(c, COMMITMENT_KEYS, COMMITMENT_KEYS, "inputCommitment");
  if (cErr) return fail("MASUMI_UNKNOWN_FIELD", cErr);
  if (c.version !== "1" || c.algorithm !== "sha256")
    return fail(
      "MASUMI_INVALID_FIELD",
      "inputCommitment must be version 1 / sha256",
    );
  if (!Array.isArray(c.parts))
    return fail(
      "MASUMI_INVALID_FIELD",
      "inputCommitment.parts must be an array",
    );
  const names = new Set<string>();
  for (const part of c.parts) {
    const pErr = closed(
      part,
      PART_KEYS,
      ["name", "canonicalization", "digest"],
      "commitment part",
    );
    if (pErr) return fail("MASUMI_UNKNOWN_FIELD", pErr);
    if (
      typeof part.name !== "string" ||
      part.name === "" ||
      names.has(part.name)
    ) {
      return fail(
        "MASUMI_INVALID_FIELD",
        "commitment part names must be unique non-empty strings",
      );
    }
    names.add(part.name);
    if (part.canonicalization !== "jcs" && part.canonicalization !== "raw") {
      return fail(
        "MASUMI_INVALID_FIELD",
        "commitment part canonicalization must be jcs or raw",
      );
    }
    if (!/^[0-9a-f]{64}$/.test(part.digest))
      return fail(
        "MASUMI_INVALID_FIELD",
        "commitment part digest must be 32-byte lowercase hex",
      );
    if (part.content !== undefined) {
      let recomputed: string;
      try {
        recomputed = commitmentPartDigest(part);
      } catch (error) {
        return fail(
          "MASUMI_INVALID_FIELD",
          `commitment part "${part.name}" content is invalid: ${(error as Error).message}`,
        );
      }
      if (recomputed !== part.digest)
        return fail(
          "MASUMI_COMMITMENT_DIGEST_MISMATCH",
          `commitment part "${part.name}" digest mismatch`,
        );
    }
  }
  if (!/^[0-9a-f]{64}$/.test(c.digest))
    return fail(
      "MASUMI_INVALID_FIELD",
      "inputCommitment.digest must be 32-byte lowercase hex",
    );
  if (computeInputHash(c) !== c.digest)
    return fail(
      "MASUMI_COMMITMENT_DIGEST_MISMATCH",
      "inputCommitment.digest does not match its manifest",
    );

  // --- terms ---
  const t = e.terms!;
  const tErr = closed(t, TERMS_KEYS, TERMS_REQUIRED, "terms");
  if (tErr) return fail("MASUMI_UNKNOWN_FIELD", tErr);
  if (t.version !== "1")
    return fail("MASUMI_INVALID_FIELD", "terms.version must be 1");
  if (t.paymentType !== "Web3CardanoV2")
    return fail(
      "MASUMI_INVALID_PAYMENT_TYPE",
      "terms.paymentType must be Web3CardanoV2",
    );
  if (!/^[0-9a-f]{64}$/.test(t.sellerNonce))
    return fail(
      "MASUMI_INVALID_FIELD",
      "terms.sellerNonce must be 32 bytes as 64 lowercase hex characters",
    );
  if (!(t.buyerNonce === "" || /^([0-9a-f]{2}){7,13}$/.test(t.buyerNonce))) {
    return fail(
      "MASUMI_INVALID_FIELD",
      "terms.buyerNonce must be empty or 7-13 bytes of lowercase hex",
    );
  }
  if (t.inputHash !== c.digest)
    return fail(
      "MASUMI_COMMITMENT_DIGEST_MISMATCH",
      "terms.inputHash must equal inputCommitment.digest",
    );
  for (const field of [
    "payByTime",
    "submitResultTime",
    "unlockTime",
    "externalDisputeUnlockTime",
  ] as const) {
    if (typeof t[field] !== "string" || !POSITIVE_MS.test(t[field])) {
      return fail(
        "MASUMI_INVALID_FIELD",
        `terms.${field} must be a positive canonical POSIX-millisecond string`,
      );
    }
  }
  for (const field of ["sellerAddress", "sellerReturnAddress"] as const) {
    const value = t[field];
    if (value === undefined && field === "sellerReturnAddress") continue;
    if (typeof value !== "string")
      return fail(
        "MASUMI_INVALID_FIELD",
        `terms.${field} must be a string address (null is invalid)`,
      );
    try {
      if (!addressMatchesNetwork(value, requirements.network))
        return fail(
          "MASUMI_INVALID_FIELD",
          `terms.${field} is not on ${requirements.network}`,
        );
      if (addressCredentials(value).payment.isScript)
        return fail(
          "MASUMI_INVALID_FIELD",
          `terms.${field} must have a key payment credential`,
        );
    } catch {
      return fail(
        "MASUMI_INVALID_FIELD",
        `terms.${field} is not a valid address`,
      );
    }
  }
  const agent = t.agentIdentifier as string | null | undefined;
  if (agent !== undefined && agent !== null && agent !== "") {
    if (typeof agent !== "string" || !LOWER_HEX_EVEN.test(agent))
      return fail(
        "MASUMI_INVALID_AGENT_IDENTIFIER",
        "agentIdentifier must be lowercase even-length hex",
      );
    if (!agent.startsWith(MASUMI_V2_REGISTRY_POLICY_ID))
      return fail(
        "MASUMI_INVALID_AGENT_IDENTIFIER",
        "agentIdentifier does not start with the Masumi V2 registry policy ID",
      );
  }

  // --- deployment ---
  if (e.deployment !== undefined) {
    const d = e.deployment;
    const dErr = closed(d, DEPLOYMENT_KEYS, DEPLOYMENT_KEYS, "deployment");
    if (dErr) return fail("MASUMI_UNKNOWN_FIELD", dErr);
    if (
      !Array.isArray(d.adminVkeys) ||
      d.adminVkeys.length === 0 ||
      !d.adminVkeys.every(
        (k) => typeof k === "string" && /^[0-9a-f]{56}$/.test(k),
      )
    ) {
      return fail(
        "MASUMI_INVALID_FIELD",
        "deployment.adminVkeys must be a non-empty array of 28-byte lowercase hex key hashes",
      );
    }
    if (
      typeof d.requiredAdmins !== "string" ||
      !POSITIVE_MS.test(d.requiredAdmins) ||
      BigInt(d.requiredAdmins) > BigInt(d.adminVkeys.length)
    ) {
      return fail(
        "MASUMI_INVALID_FIELD",
        "deployment.requiredAdmins must be a positive integer string no greater than adminVkeys.length",
      );
    }
    if (
      typeof d.cooldownPeriod !== "string" ||
      !NON_NEGATIVE_INT.test(d.cooldownPeriod)
    ) {
      return fail(
        "MASUMI_INVALID_FIELD",
        "deployment.cooldownPeriod must be a non-negative canonical integer string",
      );
    }
  }

  if (
    !masumiDeadlineIntervalsHold(
      BigInt(t.payByTime),
      BigInt(t.submitResultTime),
      BigInt(t.unlockTime),
      BigInt(t.externalDisputeUnlockTime),
    )
  ) {
    return fail(
      "MASUMI_INVALID_DEADLINE_ORDERING",
      "the four deadlines are not ordered with the minimum intervals",
    );
  }

  return null;
};

/**
 * Shape validation plus everything that needs hashing: seller COSE authorization over
 * `termsDigest`, the independently derived escrow address (must equal `payTo`) and the
 * compatibility identifier (must equal the one issued).
 */
export const validateMasumiRequirementsFull = async (
  requirements: PaymentRequirements,
): Promise<MasumiValidationFailure | null> => {
  const shape = validateMasumiRequirementsShape(requirements);
  if (shape) return shape;

  const extra = requirements.extra as PaymentRequirementsExtraMasumi;
  const terms = extra.terms!;

  const termsDigest = computeTermsDigest(buildSignedTerms(extra, requirements));
  const sellerSigned = await verifySellerTermsSignature(
    extra.referenceKey!,
    extra.referenceSignature!,
    terms.sellerAddress,
    termsDigest,
  );
  if (!sellerSigned)
    return fail(
      "MASUMI_INVALID_COSE_SIGNATURE",
      "seller COSE signature over termsDigest is invalid",
    );

  const deployment = resolveMasumiDeployment(
    requirements.network,
    extra.deployment,
  );
  if (!deployment)
    return fail(
      "MASUMI_ESCROW_ADDRESS_MISMATCH",
      `${requirements.network} has no canonical Masumi deployment - extra.deployment is required`,
    );
  if (
    masumiEscrowAddress(requirements.network, deployment) !== requirements.payTo
  ) {
    return fail(
      "MASUMI_ESCROW_ADDRESS_MISMATCH",
      "payTo is not the escrow address derived from the deployment",
    );
  }

  if (
    expectedBlockchainIdentifier(extra, requirements.payTo) !==
    extra.blockchainIdentifier
  ) {
    return fail(
      "MASUMI_INVALID_IDENTIFIER",
      "blockchainIdentifier does not match the identifier rebuilt from the requirements",
    );
  }

  return null;
};

/** What a registry validator is asked to confirm about a non-empty `terms.agentIdentifier`. */
export type MasumiRegistryClaim = {
  agentIdentifier: string;
  /** The seller address the terms are signed by. */
  sellerAddress: string;
  network: string;
  /** The signed top-level amount and asset: a registered price must resolve to exactly these. */
  amount: string;
  asset: string;
  /** The protected resource whose URL must be covered by the registry endpoint. */
  resource: ResourceInfo;
};

/**
 * Independently validates a Masumi V2 registry claim on the selected network: the registry asset,
 * seller authorization, metadata, endpoint, network and exact price. Return `true` only when the
 * claim is authentic and resolves to the signed `amount`/`asset`.
 */
export type MasumiRegistryValidator = (
  claim: MasumiRegistryClaim,
) => boolean | Promise<boolean>;

/**
 * A non-empty `agentIdentifier` asserts a registered agent's identity and reputation. The policy
 * prefix alone proves nothing (anyone can copy a registered id into terms they sign themselves),
 * so the claim is refused unless the application supplies a validator that confirms it. A
 * validator that throws also refuses. Unregistered sellers (omitted, `null` or empty) pass.
 */
export const checkRegistryClaim = async (
  requirements: PaymentRequirements,
  resource: ResourceInfo | undefined,
  validate: MasumiRegistryValidator | undefined,
): Promise<MasumiValidationFailure | null> => {
  const terms = (requirements.extra as PaymentRequirementsExtraMasumi).terms!;
  const agentIdentifier =
    typeof terms.agentIdentifier === "string" ? terms.agentIdentifier : "";
  if (agentIdentifier === "") return null;
  const code = "MASUMI_INVALID_AGENT_IDENTIFIER";
  if (!validate)
    return fail(
      code,
      "a registry claim needs an independent validator (validateRegistryClaim)",
    );
  if (!resource)
    return fail(
      code,
      "a registry claim needs the protected resource for endpoint validation",
    );
  try {
    const accepted = await validate({
      agentIdentifier,
      sellerAddress: terms.sellerAddress,
      network: requirements.network,
      amount: requirements.amount,
      asset: requirements.asset,
      resource,
    });
    return accepted === true
      ? null
      : fail(code, "registry validation rejected the claim");
  } catch {
    return fail(code, "registry validation failed");
  }
};

/** `true` for a payment of lovelace (as opposed to one native token). */
export const isLovelacePayment = (requirements: PaymentRequirements): boolean =>
  requirements.asset === LOVELACE;
