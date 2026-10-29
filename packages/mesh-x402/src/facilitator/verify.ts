import { IFetcher, Protocol, UTxO } from "@meshsdk/common";
import { deserializeTx } from "@meshsdk/core-cst";

import { secondsToSlots } from "../chain";
import { base64ToHex } from "../encoding";
import { AllowMasumiDeployment } from "../masumi/escrow-address";
import { MasumiRegistryValidator } from "../masumi/validate";
import {
  declaredDatumStatus,
  scriptPayToMatches,
  scriptV1WithInlineDatum,
} from "../script";
import {
  isCanonicalAsset,
  LOVELACE,
  parsePositiveAmount,
  toMeshUnit,
} from "../types/asset";
import { X402ErrorCode } from "../types/errors";
import {
  addressMatchesNetwork,
  CardanoNetwork,
  toNetworkId,
  tryNormalizeCardanoNetwork,
} from "../types/network";
import { PaymentPayload } from "../types/payment-payload";
import {
  getAssetTransferMethod,
  getConfirmationPolicy,
  MAX_L1_CONFIRMATIONS,
  MIN_L1_CONFIRMATIONS,
  PaymentRequirements,
  PaymentRequirementsExtraScript,
} from "../types/payment-requirements";
import { verifyMasumiPayment } from "./masumiVerify";

export type VerifyResult =
  { isValid: true } | { isValid: false; invalidReason: X402ErrorCode };

export const invalid = (invalidReason: X402ErrorCode): VerifyResult => ({
  isValid: false,
  invalidReason,
});

/** Facilitator policy knobs shared by `/verify` and `/settle`. */
export type VerifyOptions = {
  /** Range of `confirmationPolicy.l1Confirmations` this facilitator will settle (advertised in `/supported`). Default: 0..20. */
  l1Confirmations?: { minimum: number; maximum: number };
  /** Explicit approval of a non-default Masumi deployment (spec: an application MUST allow it; the seller signature is not approval). Default: deny. */
  allowMasumiDeployment?: AllowMasumiDeployment;
  /** Independently validates a non-empty Masumi `agentIdentifier` (registry asset, seller authorization, metadata, endpoint, price). Default: such claims are rejected. */
  validateRegistryClaim?: MasumiRegistryValidator;
};

export const DEFAULT_L1_CONFIRMATION_RANGE = {
  minimum: 0,
  maximum: MAX_L1_CONFIRMATIONS,
};

type Tx = ReturnType<typeof deserializeTx>;

/** Structural equality for JSON-shaped values (order-independent for object keys). */
const deepEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (
    typeof a !== "object" ||
    typeof b !== "object" ||
    a === null ||
    b === null
  )
    return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  const aKeys = Object.keys(a as Record<string, unknown>);
  const bKeys = Object.keys(b as Record<string, unknown>);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) =>
    deepEqual(
      (a as Record<string, unknown>)[k],
      (b as Record<string, unknown>)[k],
    ),
  );
};

/** Maps a CIP-34 alias (`cip34:1-764824073`) to its canonical `cardano:*` id; leaves other values untouched. */
const withCanonicalNetwork = (
  requirements: PaymentRequirements,
): PaymentRequirements => {
  const network = tryNormalizeCardanoNetwork(requirements?.network);
  return network ? { ...requirements, network } : requirements;
};

/**
 * Confirms the payload's self-reported `accepted` is exactly the requirement the resource
 * server actually offered. Without this, a client could sign a payload against a
 * `PaymentRequirements` it invented itself (e.g. a trivial amount, its own `payTo`, or -
 * for `masumi` - `deployment` params naming admin keys it controls) and every downstream
 * check would "pass" because they all check the transaction against `payload.accepted`,
 * not against ground truth. `trustedRequirements` must come from the resource server's own
 * record of what it offered, never from the payload itself.
 *
 * A CIP-34 network alias and its canonical id are the same network (spec, "Network
 * Identifiers"), so both sides are normalized before comparing. `confirmationPolicy` and the
 * default `assetTransferMethod` are compared as issued (the Masumi `termsDigest` does not
 * cover the policy, so it is bound only by this exact match).
 */
export const checkRequirementsMatchTrusted = (
  payload: PaymentPayload,
  trustedRequirements: PaymentRequirements,
): boolean =>
  deepEqual(
    withCanonicalNetwork(payload.accepted),
    withCanonicalNetwork(trustedRequirements),
  );

/** Parses the payload's signed tx once, shared across the rule checks below. */
export const parseSignedTx = (payload: PaymentPayload) => {
  const txHex = base64ToHex(payload.payload.transaction);
  return { tx: deserializeTx(txHex), txHex };
};

/** Rule 1: the tx is destined for the declared network - every output address and the body's `network_id` (when set). */
export const checkNetwork = (
  tx: Tx,
  network: CardanoNetwork,
  payTo: string,
): boolean => {
  if (!addressMatchesNetwork(payTo, network)) return false;
  const bodyNetworkId = tx.body().networkId();
  if (
    bodyNetworkId !== undefined &&
    Number(bodyNetworkId) !== toNetworkId(network)
  )
    return false;
  const outputs = tx.body().outputs();
  for (let i = 0; i < outputs.length; i++) {
    if (
      !addressMatchesNetwork(
        outputs.at(i)!.address().toBech32().toString(),
        network,
      )
    )
      return false;
  }
  return true;
};

/** Rules 2-4: an output pays `payTo` with an amount/asset that meets the requirement. */
export const checkPayToOutput = (
  tx: Tx,
  payload: PaymentPayload,
): { index: number; coin: bigint } | null => {
  const { payTo, amount, asset } = payload.accepted;
  // AssetId keys in cardano-sdk's multiasset map are the policyId+assetName hex concatenated
  // with no separator (see `@cardano-sdk/core`'s `AssetId()`) - exactly Mesh's unit format.
  const unit = toMeshUnit(asset);
  const outputs = tx.body().outputs();
  const required = BigInt(amount);

  for (let i = 0; i < outputs.length; i++) {
    const output = outputs.at(i)!;
    if (output.address().toBech32().toString() !== payTo) continue;
    const value = output.amount();
    const coin = value.coin();
    if (unit === LOVELACE) {
      if (coin >= required) return { index: i, coin };
      continue;
    }
    const multiasset = value.multiasset() as unknown as
      Map<string, bigint> | undefined;
    const held = multiasset?.get(unit);
    if (held !== undefined && held >= required) {
      return { index: i, coin };
    }
  }
  return null;
};

const inputKey = (txHash: string, index: number): string =>
  `${txHash}#${index}`;

/** The tx's inputs as `txHash#index` keys. */
const txInputKeys = (
  tx: Tx,
): { txHash: string; index: number; key: string }[] =>
  Array.from(tx.body().inputs().values()).map((input) => {
    const txHash = input.transactionId().toString();
    const index = Number(input.index());
    return { txHash, index, key: inputKey(txHash, index) };
  });

/** Rule 5 (part 1): `payload.nonce` is a well-formed `txHash#index` that is one of the tx's inputs. */
export const checkNonceInInputs = (
  tx: Tx,
  payload: PaymentPayload,
): boolean => {
  const match = /^([0-9a-f]{64})#(0|[1-9][0-9]*)$/.exec(payload.payload.nonce);
  if (!match) return false;
  return txInputKeys(tx).some((i) => i.key === payload.payload.nonce);
};

/**
 * Rule 5 (part 2): every input of the tx is currently unspent. `fetchUTxOs(hash)` on some
 * providers returns a tx's created outputs regardless of spent status, so each input is also
 * confirmed present in its owning address's live UTxO set. Returns the resolved UTxO per input
 * (in `txInputKeys` order), or the first input that is unresolved/spent.
 */
export const resolveUnspentInputs = async (
  tx: Tx,
  fetcher: IFetcher,
): Promise<
  { ok: true; utxos: Map<string, UTxO> } | { ok: false; failedKey: string }
> => {
  const utxos = new Map<string, UTxO>();
  const liveByAddress = new Map<string, Set<string>>();

  for (const { txHash, index, key } of txInputKeys(tx)) {
    const created = await fetcher.fetchUTxOs(txHash, index);
    const utxo = created.find(
      (u) => u.input.txHash === txHash && u.input.outputIndex === index,
    );
    if (!utxo) return { ok: false, failedKey: key };

    let live = liveByAddress.get(utxo.output.address);
    if (!live) {
      live = new Set(
        (await fetcher.fetchAddressUTxOs(utxo.output.address)).map((u) =>
          inputKey(u.input.txHash, u.input.outputIndex),
        ),
      );
      liveByAddress.set(utxo.output.address, live);
    }
    if (!live.has(key)) return { ok: false, failedKey: key };
    utxos.set(key, utxo);
  }
  return { ok: true, utxos };
};

/**
 * Rule 6: a transaction that moves value the inputs and outputs do not show cannot be
 * balanced from provider data and is rejected (mint, withdrawals, certificates, governance
 * deposits/donations) - a complete ledger phase-1 validator is out of scope here.
 */
export const hasUnexplainedValueMovement = (tx: Tx): boolean => {
  const body = tx.body();
  const mint = body.mint();
  return Boolean(
    (mint && mint.size > 0) ||
    (body.withdrawals() && body.withdrawals()!.size > 0) ||
    (body.certs() && body.certs()!.size() > 0) ||
    body.votingProcedures() ||
    (body.proposalProcedures() && body.proposalProcedures()!.size() > 0) ||
    body.currentTreasuryValue() !== undefined ||
    (body.donation() !== undefined && body.donation()! > 0n),
  );
};

/** Rule 6: value conservation (inputs = outputs + fee) from authenticated input values, and a fee that clears the protocol floor. */
export const checkValueConservationAndFee = (
  tx: Tx,
  txHex: string,
  inputs: Map<string, UTxO>,
  protocol: Protocol,
): boolean => {
  let inputCoin = 0n;
  const inputAssets = new Map<string, bigint>();
  for (const utxo of inputs.values()) {
    for (const a of utxo.output.amount) {
      if (a.unit === LOVELACE) inputCoin += BigInt(a.quantity);
      else
        inputAssets.set(
          a.unit,
          (inputAssets.get(a.unit) ?? 0n) + BigInt(a.quantity),
        );
    }
  }

  const outputs = tx.body().outputs();
  let outputCoin = 0n;
  const outputAssets = new Map<string, bigint>();
  for (let i = 0; i < outputs.length; i++) {
    const value = outputs.at(i)!.amount();
    outputCoin += value.coin();
    const multiasset = value.multiasset();
    if (multiasset) {
      for (const [unit, quantity] of multiasset as unknown as Map<
        string,
        bigint
      >) {
        outputAssets.set(unit, (outputAssets.get(unit) ?? 0n) + quantity);
      }
    }
  }

  const fee = tx.body().fee();
  if (inputCoin !== outputCoin + fee) return false;
  for (const unit of new Set([...inputAssets.keys(), ...outputAssets.keys()])) {
    if ((inputAssets.get(unit) ?? 0n) !== (outputAssets.get(unit) ?? 0n))
      return false;
  }

  const minFee =
    BigInt(protocol.minFeeA) * BigInt(txHex.length / 2) +
    BigInt(protocol.minFeeB);
  return fee >= minFee;
};

/**
 * Rule 7: the TTL is set, has not passed, and is not later than the slot for `now +
 * maxTimeoutSeconds`. The window is converted with the network's slot length rather than
 * assuming one slot per second.
 */
export const checkTtl = (
  tx: Tx,
  payload: PaymentPayload,
  currentSlot: number,
): { ok: true } | { ok: false; reason: "TTL_EXPIRED" | "TTL_TOO_FAR" } => {
  const ttl = tx.body().ttl();
  if (ttl === undefined) return { ok: false, reason: "TTL_EXPIRED" };
  const ttlSlot = Number(ttl);
  if (ttlSlot <= currentSlot) return { ok: false, reason: "TTL_EXPIRED" };
  const network = tryNormalizeCardanoNetwork(payload.accepted.network)!;
  if (
    ttlSlot >
    currentSlot + secondsToSlots(network, payload.accepted.maxTimeoutSeconds)
  ) {
    return { ok: false, reason: "TTL_TOO_FAR" };
  }
  return { ok: true };
};

/** Rule 8: the `payTo` output clears the protocol's minimum-UTXO floor. */
export const checkMinUtxo = (
  tx: Tx,
  outputIndex: number,
  protocol: Protocol,
): boolean => {
  const output = tx.body().outputs().at(outputIndex)!;
  const serializedBytes = output.toCbor().toString().length / 2;
  const minUtxo =
    BigInt(protocol.coinsPerUtxoSize) * BigInt(160 + serializedBytes);
  return output.amount().coin() >= minUtxo;
};

/** Envelope checks that must hold before the payload's contents can even be interpreted. */
const checkEnvelope = (
  payload: PaymentPayload,
  options: VerifyOptions,
): X402ErrorCode | null => {
  const accepted = payload?.accepted;
  if (payload?.x402Version !== 2 || !accepted || accepted.scheme !== "exact")
    return "INVALID_PAYLOAD";
  if (
    typeof payload.payload?.transaction !== "string" ||
    typeof payload.payload?.nonce !== "string"
  )
    return "INVALID_PAYLOAD";
  if (!tryNormalizeCardanoNetwork(accepted.network)) return "INVALID_NETWORK";
  if (parsePositiveAmount(accepted.amount) === null) return "INVALID_AMOUNT";
  if (!isCanonicalAsset(accepted.asset)) return "INVALID_PAYLOAD";
  if (
    !Number.isFinite(accepted.maxTimeoutSeconds) ||
    accepted.maxTimeoutSeconds <= 0
  )
    return "INVALID_PAYLOAD";

  const extra = accepted.extra as
    | {
        confirmationPolicy?: { l1Confirmations?: unknown };
        areFeesSponsored?: unknown;
      }
    | undefined;
  if (!extra || typeof extra !== "object") return "INVALID_PAYLOAD";
  if (extra.areFeesSponsored !== undefined && extra.areFeesSponsored !== false)
    return "INVALID_PAYLOAD";
  const n = getConfirmationPolicy(accepted).l1Confirmations;
  const range = options.l1Confirmations ?? DEFAULT_L1_CONFIRMATION_RANGE;
  if (
    !Number.isInteger(n) ||
    n < MIN_L1_CONFIRMATIONS ||
    n > MAX_L1_CONFIRMATIONS
  )
    return "INVALID_CONFIRMATION_POLICY";
  if (n < range.minimum || n > range.maximum)
    return "INVALID_CONFIRMATION_POLICY";
  return null;
};

/**
 * Verifies a `PaymentPayload` against the resource server's own trusted `PaymentRequirements`
 * (never the payload's self-reported `accepted` alone - see `checkRequirementsMatchTrusted`):
 * the 9 core rules (rule 9, confirmation depth, is enforced in `settle.ts` - it's meaningless
 * pre-broadcast) plus method-specific checks for `masumi`/`script`.
 *
 * Never throws on a malformed payload: anything that cannot be decoded is `INVALID_PAYLOAD`.
 */
export const verifyPayment = async (
  payload: PaymentPayload,
  trustedRequirements: PaymentRequirements,
  fetcher: IFetcher,
  protocol: Protocol,
  currentSlot: number,
  options: VerifyOptions = {},
): Promise<VerifyResult> => {
  try {
    const envelope = checkEnvelope(payload, options);
    if (envelope) return invalid(envelope);
    if (!checkRequirementsMatchTrusted(payload, trustedRequirements))
      return invalid("REQUIREMENTS_MISMATCH");

    const accepted = {
      ...payload.accepted,
      network: tryNormalizeCardanoNetwork(payload.accepted.network)!,
    };
    const normalized: PaymentPayload = { ...payload, accepted };

    const { tx, txHex } = parseSignedTx(normalized);
    if (!checkNetwork(tx, accepted.network, accepted.payTo))
      return invalid("INVALID_NETWORK");

    const payToOutput = checkPayToOutput(tx, normalized);
    if (!payToOutput) return invalid("PAYTO_NOT_FOUND");

    if (!checkNonceInInputs(tx, normalized))
      return invalid("NONCE_NOT_IN_INPUTS");
    const resolved = await resolveUnspentInputs(tx, fetcher);
    if (!resolved.ok) {
      return invalid(
        resolved.failedKey === normalized.payload.nonce
          ? "NONCE_NOT_UNSPENT"
          : "INPUT_NOT_UNSPENT",
      );
    }

    if (hasUnexplainedValueMovement(tx))
      return invalid("UNSUPPORTED_TX_FEATURE");
    if (!checkValueConservationAndFee(tx, txHex, resolved.utxos, protocol))
      return invalid("VALUE_NOT_CONSERVED");

    const ttl = checkTtl(tx, normalized, currentSlot);
    if (!ttl.ok) return invalid(ttl.reason);
    if (!checkMinUtxo(tx, payToOutput.index, protocol))
      return invalid("BELOW_MIN_UTXO");

    const method = getAssetTransferMethod(accepted);
    if (method === "masumi") {
      return await verifyMasumiPayment(
        normalized,
        tx,
        resolved.utxos,
        protocol,
        currentSlot,
        options,
      );
    }
    if (method === "script")
      return verifyScriptPayment(normalized, tx, payToOutput.index);
    return { isValid: true };
  } catch {
    return invalid("INVALID_PAYLOAD");
  }
};

const verifyScriptPayment = (
  payload: PaymentPayload,
  tx: Tx,
  payToIndex: number,
): VerifyResult => {
  const extra = payload.accepted.extra as PaymentRequirementsExtraScript;
  // A requirement declaring neither `script` nor `scriptHash` can never be checked, so it is
  // rejected outright rather than silently passing.
  if (!extra.script && !extra.scriptHash)
    return invalid("SCRIPT_ADDRESS_MISMATCH");
  if (scriptV1WithInlineDatum(extra)) return invalid("SCRIPT_V1_WITH_DATUM");
  // `payTo`'s script credential must equal the declared script's hash (a stake part on `payTo` is fine).
  if (!scriptPayToMatches(extra, payload.accepted.payTo))
    return invalid("SCRIPT_ADDRESS_MISMATCH");
  // The datum's *content* is the server's contract (not judged here), but a declared datum must be
  // the one attached inline to the `payTo` output, or the server could never spend what it was paid.
  const output = tx.body().outputs().at(payToIndex)!;
  const inlineDatum = output.datum()?.asInlineData()?.toCbor().toString();
  const datum = declaredDatumStatus(extra, inlineDatum);
  if (datum === "missing") return invalid("SCRIPT_DATUM_NOT_INLINE");
  if (datum === "mismatch") return invalid("SCRIPT_DATUM_MISMATCH");
  return { isValid: true };
};
