/**
 * Encodes `vested_pay`'s `Action` redeemer type (7 variants; constructor tag = position below,
 * 0-indexed, matching the Aiken source's `pub type Action { ... }` declaration order).
 */
import { Data, mConStr, mConStr0, mConStr1, mConStr2, mConStr3 } from "@meshsdk/common";

import { AdminSignature, AssetValueEntry } from "../cip8-admin";

export const WITHDRAW_REDEEMER: Data = mConStr0([]);
export const SET_REFUND_REQUESTED_REDEEMER: Data = mConStr1([]);
export const AUTHORIZE_WITHDRAWAL_REDEEMER: Data = mConStr2([]);
export const WITHDRAW_REFUND_REDEEMER: Data = mConStr3([]);
export const SUBMIT_RESULT_REDEEMER: Data = mConStr(5, []);
export const AUTHORIZE_REFUND_REDEEMER: Data = mConStr(6, []);

/** `AssetValue = Pairs<ByteArray, Pairs<ByteArray, Int>>` - a native Plutus Map, nested. */
const assetValueToMeshData = (entries: AssetValueEntry[]): Map<string, Map<string, bigint>> =>
  new Map(
    entries.map((entry) => [
      entry.policyId,
      new Map(entry.assets.map((a) => [a.assetName, a.quantity])),
    ]),
  );

/** `AdminSignature { verification_key, protected_headers, signature }` - a 3-field record (Constr 0). */
const adminSignatureToMeshData = (sig: AdminSignature): Data =>
  mConStr0([sig.verificationKey, sig.protectedHeaders, sig.signature]);

export const buildWithdrawDisputedRedeemer = (
  buyerValue: AssetValueEntry[],
  sellerValue: AssetValueEntry[],
  adminSignatures: AdminSignature[],
): Data =>
  mConStr(4, [
    assetValueToMeshData(buyerValue),
    assetValueToMeshData(sellerValue),
    adminSignatures.map(adminSignatureToMeshData),
  ]);
