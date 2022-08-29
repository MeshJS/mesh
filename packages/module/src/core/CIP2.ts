import type { Asset, UTxO } from '@mesh/common/types';

export const largestFirstMultiAsset = (
  requestedOutputSet: Asset[], initialUTxOSet: UTxO[]
): UTxO[] => {
  const summedOutputSet = new Map<string, number>();
  requestedOutputSet.forEach((asset) => {
    if (summedOutputSet.has(asset.unit)) {
      const newQuantity = parseInt(asset.quantity);
      const existingQuantity = summedOutputSet.get(asset.unit)!;
      summedOutputSet.set(asset.unit, existingQuantity + newQuantity);
    }
    summedOutputSet.set(asset.unit, parseInt(asset.quantity));
  });

  const sortedMultiAssetUTxOSet = initialUTxOSet
    .filter((utxo) => {
      return utxo.output.amount.length > 1;
    })
    .sort((a, b) => {
      const aLovelaceQuantity = parseInt(
        a.output.amount.find((asset) => asset.unit === 'lovelace')?.quantity ?? '0',
      );

      const bLovelaceQuantity = parseInt(
        b.output.amount.find((asset) => asset.unit === 'lovelace')?.quantity ?? '0',
      );

      return aLovelaceQuantity - bLovelaceQuantity;
    });

  let selection: UTxO[] = [];
  sortedMultiAssetUTxOSet.some((utxo) => {
    if (enoughValueHasBeenSelected(selection, summedOutputSet))
      return true;

    if (valueCanBeSelected(utxo, summedOutputSet))
      selection.push(utxo);

    return false;
  });

  return selection;
};

const enoughValueHasBeenSelected = (
  selection: UTxO[], assets: Map<string, number>
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

const valueCanBeSelected = (
  utxo: UTxO, assets: Map<string, number>
): boolean => {
  return Array.from(assets.keys()).some((unit) => {
    return utxo.output.amount
      .find((asset) => asset.unit === unit) !== undefined;
  });
};
