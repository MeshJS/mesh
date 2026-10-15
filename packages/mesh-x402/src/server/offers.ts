/**
 * Resource-server helpers: build the `PaymentRequirements` a 402 challenge advertises for each
 * `assetTransferMethod`. The client and facilitator sides live elsewhere in this package; this is
 * the issuer side, so an application needs nothing beyond `@meshsdk/x402` to run all three methods.
 */
import { randomBytes } from "node:crypto";

import { MeshWallet } from "@meshsdk/wallet";

import {
  MASUMI_DEFAULT_DEPLOYMENT,
  masumiEscrowAddress,
} from "../masumi/escrow-address";
import { expectedBlockchainIdentifier } from "../masumi/identifier";
import {
  buildSignedTerms,
  commitmentPartDigest,
  computeInputHash,
  computeTermsDigest,
} from "../masumi/terms";
import { validateMasumiRequirementsFull } from "../masumi/validate";
import { resolveScriptAddress } from "../script";
import { X402Error } from "../types/errors";
import { CardanoNetwork } from "../types/network";
import {
  PaymentRequirements,
  PaymentRequirementsExtraMasumi,
  PaymentRequirementsExtraScript,
} from "../types/payment-requirements";

export const DEFAULT_OFFER_TIMEOUT_SECONDS = 600;

type CommonOfferParams = {
  network: CardanoNetwork;
  /** Atomic units, decimal string. */
  amount: string;
  /** `"lovelace"` or `"policyId.assetNameHex"`. Default `lovelace`. */
  asset?: string;
  /** `confirmationPolicy.l1Confirmations` (-1..20). Default 1. */
  confirmations?: number;
  maxTimeoutSeconds?: number;
};

const common = (p: CommonOfferParams) => ({
  scheme: "exact" as const,
  network: p.network,
  amount: p.amount,
  asset: p.asset ?? "lovelace",
  maxTimeoutSeconds: p.maxTimeoutSeconds ?? DEFAULT_OFFER_TIMEOUT_SECONDS,
});
const policy = (p: CommonOfferParams) => ({
  confirmationPolicy: { l1Confirmations: p.confirmations ?? 1 },
});

/** `default` method: pay `payTo` directly. */
export const buildDefaultOffer = (
  p: CommonOfferParams & { payTo: string },
): PaymentRequirements => ({
  ...common(p),
  payTo: p.payTo,
  extra: { ...policy(p) },
});

/** `script` method: lock into the address of `script` (parameters applied), optionally with an inline CBOR datum. */
export const buildScriptOffer = (
  p: CommonOfferParams &
    Pick<
      PaymentRequirementsExtraScript,
      "script" | "scriptHash" | "parameters" | "datum"
    >,
): PaymentRequirements => {
  const extra: PaymentRequirementsExtraScript = {
    assetTransferMethod: "script",
    ...policy(p),
    ...(p.script ? { script: p.script } : {}),
    ...(p.scriptHash ? { scriptHash: p.scriptHash } : {}),
    ...(p.parameters ? { parameters: p.parameters } : {}),
    ...(p.datum ? { datum: p.datum } : {}),
  };
  return { ...common(p), payTo: resolveScriptAddress(extra, p.network), extra };
};

export type MasumiOfferParams = CommonOfferParams & {
  /** Signs `termsDigest` (CIP-8) - the seller's authorization of the terms. */
  sellerWallet: MeshWallet;
  sellerAddress: string;
  /** Input the job is bound to; committed to via `inputCommitment`. */
  jobInput: unknown;
  agentIdentifier?: string;
  deployment?: PaymentRequirementsExtraMasumi["deployment"];
  /** Buyer-sourced nonce (14-26 lowercase hex characters) taken from the request, if the API defines one. Default: empty. */
  buyerNonce?: string;
  /**
   * Milliseconds from now to `payByTime`. Default and maximum: `maxTimeoutSeconds` (the spec bounds `pay_by_time` by
   * issuance + `maxTimeoutSeconds`). The other deadlines follow with the spec's minimum gaps + margin, and
   * `submitResultTime` is at least 15 minutes out.
   */
  payByOffsetMs?: number;
};

/**
 * `masumi` method: a fully seller-signed offer (commitment, ordered deadlines, `termsDigest`
 * signature, `blockchainIdentifier`). The issuer MUST store the returned requirements keyed by
 * `termsDigest` and pass that record - not the client's copy - to the facilitator.
 */
export const buildMasumiOffer = async (
  p: MasumiOfferParams,
): Promise<{ requirements: PaymentRequirements; termsDigest: string }> => {
  const deployment = p.deployment;
  const payTo = masumiEscrowAddress(
    p.network,
    deployment ?? MASUMI_DEFAULT_DEPLOYMENT,
  );

  const maxTimeoutMs =
    (p.maxTimeoutSeconds ?? DEFAULT_OFFER_TIMEOUT_SECONDS) * 1000;
  const payByOffsetMs = p.payByOffsetMs ?? maxTimeoutMs;
  if (payByOffsetMs > maxTimeoutMs) {
    throw new X402Error(
      "MASUMI_INVALID_DEADLINE_ORDERING",
      "payByOffsetMs must not exceed maxTimeoutSeconds",
    );
  }
  const issuedAt = Date.now();
  const payByTime = issuedAt + payByOffsetMs;
  const submitResultTime = Math.max(
    payByTime + 6 * 60 * 1000,
    issuedAt + 16 * 60 * 1000,
  );
  const unlockTime = submitResultTime + 16 * 60 * 1000;
  const externalDisputeUnlockTime = unlockTime + 16 * 60 * 1000;

  const part = {
    name: "job-input",
    canonicalization: "jcs" as const,
    content: p.jobInput,
    digest: commitmentPartDigest({
      canonicalization: "jcs",
      content: p.jobInput,
    }),
  };
  const inputCommitment = {
    version: "1" as const,
    algorithm: "sha256" as const,
    parts: [part],
    digest: "",
  };
  const inputHash = computeInputHash(inputCommitment);
  inputCommitment.digest = inputHash;

  const base: Omit<PaymentRequirements, "extra"> = { ...common(p), payTo };
  const unsigned: PaymentRequirementsExtraMasumi = {
    assetTransferMethod: "masumi",
    ...policy(p),
    inputCommitment,
    terms: {
      version: "1",
      paymentType: "Web3CardanoV2",
      sellerAddress: p.sellerAddress,
      sellerNonce: randomBytes(32).toString("hex"),
      buyerNonce: p.buyerNonce ?? "",
      agentIdentifier: p.agentIdentifier ?? "",
      inputHash,
      payByTime: String(payByTime),
      submitResultTime: String(submitResultTime),
      unlockTime: String(unlockTime),
      externalDisputeUnlockTime: String(externalDisputeUnlockTime),
    },
    ...(deployment ? { deployment } : {}),
  };

  const termsDigest = computeTermsDigest(
    buildSignedTerms(unsigned, { ...base, extra: unsigned }),
  );
  const sig = await p.sellerWallet.signData(termsDigest);
  const signed: PaymentRequirementsExtraMasumi = {
    ...unsigned,
    referenceKey: sig.key,
    referenceSignature: sig.signature,
  };
  const extra: PaymentRequirementsExtraMasumi = {
    ...signed,
    blockchainIdentifier: expectedBlockchainIdentifier(signed, payTo),
  };
  const requirements: PaymentRequirements = { ...base, extra };
  // Never hand out an offer the client or facilitator would refuse.
  const failure = await validateMasumiRequirementsFull(requirements);
  if (failure) throw new X402Error(failure.code, failure.detail);
  return { requirements, termsDigest };
};

/** The `termsDigest` a Masumi payload's `accepted` terms hash to - the key for looking up the issuer's stored offer. */
export const masumiTermsDigestOf = (accepted: PaymentRequirements): string =>
  computeTermsDigest(
    buildSignedTerms(
      accepted.extra as PaymentRequirementsExtraMasumi,
      accepted,
    ),
  );
