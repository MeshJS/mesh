import { BigNum, DEFAULT_PROTOCOL_PARAMETERS, Quantity, Unit, UTxO } from "..";
import {
  largestLovelaceQuantity,
  maxTxFees,
  multiAssetUTxO,
  selectValue,
} from "./common";

export const largestFirstMultiAsset = (
  requestedOutputSet: Map<Unit, Quantity>,
  initialUTxOSet: UTxO[],
  includeTxFees = false,
  parameters = DEFAULT_PROTOCOL_PARAMETERS,
): UTxO[] => {
  const sortedMultiAssetUTxOs = initialUTxOSet
    .filter(multiAssetUTxO)
    .sort(largestLovelaceQuantity);

  const txFees = maxTxFees(parameters);
  const lovelace = requestedOutputSet.get("lovelace") ?? "0";

  const quantity = includeTxFees
    ? BigNum.new(lovelace).checkedAdd(txFees).toString()
    : lovelace;

  requestedOutputSet.set("lovelace", quantity);

  const selection = selectValue(sortedMultiAssetUTxOs, requestedOutputSet);

  return selection;
};
