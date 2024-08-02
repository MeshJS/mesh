import {
  BigNum,
  DEFAULT_PROTOCOL_PARAMETERS,
  Quantity,
  resolveTxFees,
  Unit,
  UTxO,
} from "..";
import { largestLovelaceQuantity, multiAssetUTxO, selectValue } from "./common";

export const largestFirst = (
  lovelace: Quantity,
  initialUTxOSet: UTxO[],
  includeTxFees = false,
  { maxTxSize, minFeeA, minFeeB } = DEFAULT_PROTOCOL_PARAMETERS,
): UTxO[] => {
  const sortedUTxOs = initialUTxOSet
    .filter((utxo) => multiAssetUTxO(utxo) === false)
    .sort(largestLovelaceQuantity);

  const maxTxFees = BigNum.new(resolveTxFees(maxTxSize, minFeeA, minFeeB));

  const quantity = includeTxFees
    ? BigNum.new(lovelace).checkedAdd(maxTxFees).toString()
    : lovelace;

  const requestedOutputSet = new Map<Unit, Quantity>([["lovelace", quantity]]);

  const selection = selectValue(sortedUTxOs, requestedOutputSet);
  return selection;
};
