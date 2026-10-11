import type {
  MultiAssetPrototype,
  TransactionInputPrototype,
  TransactionOutputPrototype,
  ValuePrototype,
} from "@meshsdk/common";

import { AssetId, TransactionInput, TransactionOutput, Value } from "../types";
import { plutusDataToPrototype } from "./plutus-data";

export const transactionInputToPrototype = (
  input: TransactionInput,
): TransactionInputPrototype => ({
  transaction_id: input.transactionId().toString(),
  index: Number(input.index()),
});

/** Inverse of `multiAssetPrototypeToAssets` — splits each `AssetId` (policyId ++ assetNameHex)
 * back into the prototype's two-level `{ policyId: { assetNameHex: quantity } }` map. */
export const valueToPrototype = (value: Value): ValuePrototype => {
  const multiasset = value.multiasset();
  if (!multiasset || multiasset.size === 0) {
    return { coin: value.coin().toString() };
  }

  const out: MultiAssetPrototype = {};
  for (const [assetId, quantity] of multiasset) {
    const policyId = AssetId.getPolicyId(assetId).toString();
    const assetName = AssetId.getAssetName(assetId).toString();
    (out[policyId] ??= {})[assetName] = quantity.toString();
  }
  return { coin: value.coin().toString(), multiasset: out };
};

export const transactionOutputToPrototype = (
  output: TransactionOutput,
): TransactionOutputPrototype => {
  const result: TransactionOutputPrototype = {
    address: output.address().toBech32().toString(),
    amount: valueToPrototype(output.amount()),
  };

  const datum = output.datum();
  if (datum) {
    const dataHash = datum.asDataHash();
    const inline = datum.asInlineData();
    if (dataHash) {
      result.plutus_data = { type: "DATA_HASH", value: dataHash.toString() };
    } else if (inline) {
      result.plutus_data = {
        type: "DATA",
        value: { type: "MANUAL", data: plutusDataToPrototype(inline) },
      };
    }
  }

  const scriptRef = output.scriptRef();
  if (scriptRef) {
    result.script_ref = scriptRef.toCbor().toString();
  }

  return result;
};
