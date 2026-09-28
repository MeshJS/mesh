import { deserializeTx } from "@meshsdk/core-cst";
import { IFetcher, Protocol } from "@meshsdk/common";

import { LOVELACE, toMeshUnit } from "../types/asset";
import {
  getAssetTransferMethod,
  PaymentRequirements,
  PaymentRequirementsExtraScript,
} from "../types/payment-requirements";
import { PaymentPayload } from "../types/payment-payload";
import { X402ErrorCode } from "../types/errors";
import { resolveScriptAddress } from "../script";
import { verifyMasumiPayment } from "./masumiVerify";

export type VerifyResult = { isValid: true } | { isValid: false; invalidReason: X402ErrorCode };

export const invalid = (invalidReason: X402ErrorCode): VerifyResult => ({ isValid: false, invalidReason });

const base64ToHex = (base64: string): string => Buffer.from(base64, "base64").toString("hex");

/** Structural equality for JSON-shaped values (order-independent for object keys). */
const deepEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  const aKeys = Object.keys(a as Record<string, unknown>);
  const bKeys = Object.keys(b as Record<string, unknown>);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) =>
    deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
};

/**
 * Confirms the payload's self-reported `accepted` is exactly the requirement the resource
 * server actually offered. Without this, a client could sign a payload against a
 * `PaymentRequirements` it invented itself (e.g. a trivial amount, its own `payTo`, or -
 * for `masumi` - `deployment` params naming admin keys it controls) and every downstream
 * check would "pass" because they all check the transaction against `payload.accepted`,
 * not against ground truth. `trustedRequirements` must come from the resource server's own
 * record of what it offered, never from the payload itself.
 */
const checkRequirementsMatchTrusted = (
  payload: PaymentPayload,
  trustedRequirements: PaymentRequirements,
): boolean => deepEqual(payload.accepted, trustedRequirements);

/** Parses the payload's signed tx once, shared across the rule checks below. */
export const parseSignedTx = (payload: PaymentPayload) => {
  const txHex = base64ToHex(payload.payload.transaction);
  return { tx: deserializeTx(txHex), txHex };
};

/** Rule 1: the tx is destined for the declared network (best-effort - address prefixes only). */
export const checkNetwork = (payload: PaymentPayload): boolean => {
  const addr = payload.accepted.payTo;
  const isMainnetPrefixed = addr.startsWith("addr1") || addr.startsWith("stake1");
  return payload.accepted.network === "cardano:mainnet" ? isMainnetPrefixed : !isMainnetPrefixed;
};

/** Rules 2-4: an output pays `payTo` with an amount/asset that meets the requirement. */
export const checkPayToOutput = (
  tx: ReturnType<typeof deserializeTx>,
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
    const multiasset = value.multiasset() as unknown as Map<string, bigint> | undefined;
    const held = multiasset?.get(unit);
    if (held !== undefined && held >= required) {
      return { index: i, coin };
    }
  }
  return null;
};

/** Rule 5: `payload.nonce` (`txHash#index`) is currently an unspent input. */
export const checkNonceUnspent = async (payload: PaymentPayload, fetcher: IFetcher): Promise<boolean> => {
  const [nonceTxHash, indexStr] = payload.payload.nonce.split("#");
  const index = Number(indexStr);
  if (!nonceTxHash || Number.isNaN(index)) return false;

  const created = await fetcher.fetchUTxOs(nonceTxHash, index);
  const output = created.find((u) => u.input.txHash === nonceTxHash && u.input.outputIndex === index);
  if (!output) return false;

  // fetchUTxOs on some providers returns a tx's created outputs regardless of current spent
  // status, so also confirm it's still present in its owning address's live UTxO set.
  const current = await fetcher.fetchAddressUTxOs(output.output.address);
  return current.some((u) => u.input.txHash === nonceTxHash && u.input.outputIndex === index);
};

/** Rule 6: value conservation (inputs = outputs + fee) and a fee that clears the protocol floor. */
export const checkValueConservationAndFee = async (
  tx: ReturnType<typeof deserializeTx>,
  txHex: string,
  fetcher: IFetcher,
  protocol: Protocol,
): Promise<boolean> => {
  const inputs = Array.from(tx.body().inputs().values());
  let inputCoin = 0n;
  const inputAssets = new Map<string, bigint>();

  for (const input of inputs) {
    const txHash = input.transactionId().toString();
    const index = Number(input.index());
    const candidates = await fetcher.fetchUTxOs(txHash, index);
    const utxo = candidates.find((u) => u.input.outputIndex === index);
    if (!utxo) return false; // input no longer resolvable - fail closed
    for (const a of utxo.output.amount) {
      if (a.unit === LOVELACE) inputCoin += BigInt(a.quantity);
      else inputAssets.set(a.unit, (inputAssets.get(a.unit) ?? 0n) + BigInt(a.quantity));
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
      for (const [unit, quantity] of multiasset as unknown as Map<string, bigint>) {
        outputAssets.set(unit, (outputAssets.get(unit) ?? 0n) + quantity);
      }
    }
  }

  const fee = tx.body().fee();
  if (inputCoin !== outputCoin + fee) return false;
  if (inputAssets.size !== outputAssets.size) return false;
  for (const [unit, quantity] of inputAssets) {
    if (outputAssets.get(unit) !== quantity) return false;
  }

  const minFee = BigInt(protocol.minFeeA) * BigInt(txHex.length / 2) + BigInt(protocol.minFeeB);
  return fee >= minFee;
};

/** Rule 7: TTL is set, not already expired, and within `maxTimeoutSeconds`. */
export const checkTtl = (
  tx: ReturnType<typeof deserializeTx>,
  payload: PaymentPayload,
  currentSlot: number,
): boolean => {
  const ttl = tx.body().ttl();
  if (ttl === undefined) return false;
  const ttlSlot = Number(ttl);
  return ttlSlot > currentSlot && ttlSlot <= currentSlot + payload.accepted.maxTimeoutSeconds;
};

/** Rule 8: the `payTo` output clears the protocol's minimum-UTXO floor. */
export const checkMinUtxo = (
  tx: ReturnType<typeof deserializeTx>,
  outputIndex: number,
  protocol: Protocol,
): boolean => {
  const output = tx.body().outputs().at(outputIndex)!;
  const serializedBytes = output.toCbor().toString().length / 2;
  const minUtxo = BigInt(protocol.coinsPerUtxoSize) * BigInt(160 + serializedBytes);
  return output.amount().coin() >= minUtxo;
};

/**
 * Verifies a `PaymentPayload` against the resource server's own trusted `PaymentRequirements`
 * (never the payload's self-reported `accepted` alone - see `checkRequirementsMatchTrusted`):
 * the 9 core rules (rule 9, confirmation depth, is enforced in `settle.ts` - it's meaningless
 * pre-broadcast) plus method-specific checks for `masumi`/`script`.
 */
export const verifyPayment = async (
  payload: PaymentPayload,
  trustedRequirements: PaymentRequirements,
  fetcher: IFetcher,
  protocol: Protocol,
  currentSlot: number,
): Promise<VerifyResult> => {
  if (!checkRequirementsMatchTrusted(payload, trustedRequirements)) return invalid("REQUIREMENTS_MISMATCH");
  if (!checkNetwork(payload)) return invalid("INVALID_NETWORK");

  const { tx, txHex } = parseSignedTx(payload);

  const payToOutput = checkPayToOutput(tx, payload);
  if (!payToOutput) return invalid("PAYTO_NOT_FOUND");

  if (!(await checkNonceUnspent(payload, fetcher))) return invalid("NONCE_NOT_UNSPENT");
  if (!(await checkValueConservationAndFee(tx, txHex, fetcher, protocol))) return invalid("VALUE_NOT_CONSERVED");
  if (!checkTtl(tx, payload, currentSlot)) return invalid("TTL_EXPIRED");
  if (!checkMinUtxo(tx, payToOutput.index, protocol)) return invalid("BELOW_MIN_UTXO");

  const method = getAssetTransferMethod(payload.accepted);
  if (method === "masumi") return verifyMasumiPayment(payload, tx, fetcher, currentSlot);
  if (method === "script") return verifyScriptPayment(payload);
  return { isValid: true };
};

const verifyScriptPayment = (payload: PaymentPayload): VerifyResult => {
  const extra = payload.accepted.extra as PaymentRequirementsExtraScript;
  // Must independently derive/confirm `payTo` whenever either `script` or `scriptHash` is
  // declared - matching `resolveScriptAddress`'s own precedence (script+params first, else
  // scriptHash). A requirement declaring neither can never be checked, so it's rejected
  // outright rather than silently passing.
  if (!extra.script && !extra.scriptHash) return invalid("SCRIPT_ADDRESS_MISMATCH");
  const derived = resolveScriptAddress(extra, payload.accepted.network);
  if (derived !== payload.accepted.payTo) return invalid("SCRIPT_ADDRESS_MISMATCH");
  // Datum content is intentionally not validated here - that's the resource server's job.
  return { isValid: true };
};
