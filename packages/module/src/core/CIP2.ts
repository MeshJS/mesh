import type { Asset, UTxO } from '@mesh/common/types';

export const largestFirstMultiAsset = (
  requestedOutputSet: Asset[], initialUTxOSet: UTxO[],
): UTxO[] => {
  const sortedMultiAssetUTxO = initialUTxOSet
    .filter(multiAssetUTxO)
    .sort(largestLovelaceQuantity);

  const summedOutputSet = new Map<string, number>();
  requestedOutputSet.forEach((asset) => {
    if (summedOutputSet.has(asset.unit)) {
      const newQuantity = parseInt(asset.quantity);
      const existingQuantity = summedOutputSet.get(asset.unit) ?? 0;
      summedOutputSet.set(asset.unit, existingQuantity + newQuantity);
    }
    summedOutputSet.set(asset.unit, parseInt(asset.quantity));
  });

  const selection = selectValue(
    sortedMultiAssetUTxO,
    summedOutputSet,
  );

  return selection;
};

const enoughValueHasBeenSelected = (
  selection: UTxO[], assets: Map<string, number>,
): boolean => {
  return Array
    .from(
      assets, (asset) => ({ unit: asset[0], quantity: asset[1] }),
    )
    .every((asset) => {
      selection
        .filter((utxo) => {
          return utxo.output.amount
            .find((a) => a.unit === asset.unit) !== undefined;
        })
        .reduce((selectedQuantity, utxo) => {
          const utxoQuantity = utxo.output.amount
            .reduce((quantity, a) => quantity + parseInt(a.quantity) , 0);

          return selectedQuantity + utxoQuantity;
        }, 0) >= asset.quantity;
    });
};

const largestLovelaceQuantity = (
  utxoA: UTxO, utxoB: UTxO,
): number => {
  const aLovelaceQuantity = parseInt(
    utxoA.output.amount.find((asset) => asset.unit === 'lovelace')?.quantity ?? '0',
  );

  const bLovelaceQuantity = parseInt(
    utxoB.output.amount.find((asset) => asset.unit === 'lovelace')?.quantity ?? '0',
  );

  return aLovelaceQuantity - bLovelaceQuantity;
};

const multiAssetUTxO = (utxo: UTxO): boolean => utxo.output.amount.length > 1;

const selectValue = (
  inputUTxO: UTxO[],
  outputSet: Map<string, number>,
  selection: UTxO[] = [],
): UTxO[] => {
  if (
    inputUTxO.length === 0
    || enoughValueHasBeenSelected(selection, outputSet)
  ) {
    return selection;
  }

  if (valueCanBeSelected(inputUTxO[0], outputSet)) {
    return selectValue(
      inputUTxO.slice(1), outputSet,
      [...selection, inputUTxO[0]],
    );
  }

  return selectValue(
    inputUTxO.slice(1),
    outputSet,
    selection,
  );
};

const valueCanBeSelected = (
  utxo: UTxO, assets: Map<string, number>,
): boolean => {
  return Array.from(assets.keys()).some((unit) => {
    return utxo.output.amount
      .find((asset) => asset.unit === unit) !== undefined;
  });
};
