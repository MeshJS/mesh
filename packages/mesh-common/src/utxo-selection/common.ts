import { BigNum, Protocol, Quantity, resolveTxFees, Unit, UTxO } from "..";

export const enoughValueHasBeenSelected = (
  selection: UTxO[],
  assets: Map<Unit, Quantity>,
): boolean => {
  return Array.from(assets, (asset) => ({
    unit: asset[0],
    quantity: BigNum.new(asset[1]),
  })).every((asset) => {
    return (
      selection
        .filter((utxo) => {
          return (
            utxo.output.amount.find((a) => a.unit === asset.unit) !== undefined
          );
        })
        .reduce((selectedQuantity, utxo) => {
          const utxoQuantity = utxo.output.amount.reduce(
            (quantity, a) =>
              quantity.checkedAdd(
                BigNum.new(asset.unit === a.unit ? a.quantity : "0"),
              ),
            BigNum.new("0"),
          );

          return selectedQuantity.checkedAdd(utxoQuantity);
        }, BigNum.new("0"))
        .lessThan(asset.quantity) === false
    );
  });
};

export const largestLovelaceQuantity = (utxoA: UTxO, utxoB: UTxO): number => {
  const aLovelaceQuantity = BigNum.new(
    utxoA.output.amount.find((asset) => asset.unit === "lovelace")?.quantity ??
      "0",
  );

  const bLovelaceQuantity = BigNum.new(
    utxoB.output.amount.find((asset) => asset.unit === "lovelace")?.quantity ??
      "0",
  );

  return bLovelaceQuantity.compare(aLovelaceQuantity);
};

export const maxTxFees = (parameters: Protocol) => {
  const { maxTxSize, minFeeA, minFeeB } = parameters;

  return BigNum.new(resolveTxFees(maxTxSize, minFeeA, minFeeB));
};

export const multiAssetUTxO = (utxo: UTxO): boolean =>
  utxo.output.amount.length > 1;

export const selectedLovelaceQuantity = (multiAsset: UTxO[]) => {
  return multiAsset.reduce((sum, utxo) => {
    const lovelace =
      utxo.output.amount.find((asset) => asset.unit === "lovelace")?.quantity ??
      "0";

    return sum.checkedAdd(BigNum.new(lovelace));
  }, BigNum.new("0"));
};

export const remainingLovelace = (
  quantity: Quantity,
  initialUTxOSet: UTxO[],
) => {
  const sortedUTxOs = initialUTxOSet.sort(largestLovelaceQuantity);

  const requestedOutputSet = new Map<Unit, Quantity>([["lovelace", quantity]]);

  const selection = selectValue(sortedUTxOs, requestedOutputSet);

  return selection;
};

export const selectValue = (
  inputUTxO: UTxO[],
  outputSet: Map<Unit, Quantity>,
  selection: UTxO[] = [],
): UTxO[] => {
  if (
    inputUTxO.length === 0 ||
    enoughValueHasBeenSelected(selection, outputSet)
  ) {
    return selection;
  }

  if (valueCanBeSelected(inputUTxO[0]!, outputSet)) {
    return selectValue(inputUTxO.slice(1), outputSet, [
      ...selection,
      inputUTxO[0]!,
    ]);
  }

  return selectValue(inputUTxO.slice(1), outputSet, selection);
};

export const valueCanBeSelected = (
  utxo: UTxO,
  assets: Map<Unit, Quantity>,
): boolean => {
  return Array.from(assets.keys()).some((unit) => {
    return (
      utxo.output.amount.find((asset) => asset.unit === unit) !== undefined
    );
  });
};
