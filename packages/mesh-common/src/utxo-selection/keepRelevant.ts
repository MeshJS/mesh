import { BigNum, Quantity, Unit, UTxO } from "..";
import { remainingLovelace, selectedLovelaceQuantity } from "./common";

export const keepRelevant = (
  requiredAssets: Map<Unit, Quantity>,
  inputs: UTxO[],
  threshold = "5000000",
) => {
  const requestedLovelace = BigNum.new(
    requiredAssets.get("lovelace") ?? "0",
  ).checkedAdd(BigNum.new(threshold));

  const multiAsset = inputs.filter((utxo) =>
    utxo.output.amount
      .filter((asset) => asset.unit !== "lovelace")
      .some((asset) => requiredAssets.has(asset.unit)),
  );

  const selectedLovelace = selectedLovelaceQuantity(multiAsset);

  const lovelace = selectedLovelace.lessThan(requestedLovelace)
    ? remainingLovelace(
        requestedLovelace.clampedSub(selectedLovelace).toString(),
        inputs.filter((input) => {
          return !multiAsset.some(
            (selectedUtxo) =>
              selectedUtxo.input.txHash === input.input.txHash &&
              selectedUtxo.input.outputIndex === input.input.outputIndex,
          );
        }),
      )
    : [];

  return [...lovelace, ...multiAsset];
};
