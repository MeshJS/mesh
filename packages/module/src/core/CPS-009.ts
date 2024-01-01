import type { Quantity, UTxO, Unit } from '@mesh/common/types';

export const selectUtxos = (
  inputs: UTxO[],
  requiredAssets: Map<Unit, Quantity>,
  threshold: Quantity
): UTxO[] => {
  let totalRequiredAssets = new Map<Unit, Quantity>(requiredAssets);
  totalRequiredAssets.set(
    'lovelace',
    totalRequiredAssets.get('lovelace') + threshold
  );
  let utxoMap = new Map<Number, UTxO>();
  for (let i = 0; i < inputs.length; i++) {
    utxoMap.set(i, inputs[i]);
  }
  let selectedInputs = new Set<Number>();
  let onlyLovelace = new Set<Number>();
  let singletons = new Set<Number>();
  let pairs = new Set<Number>();
  let rest = new Set<Number>();
  for (let i = 0; i < inputs.length; i++) {
    switch (inputs[i].output.amount.length) {
      case 1: {
        onlyLovelace.add(i);
        break;
      }
      case 2: {
        singletons.add(i);
        break;
      }
      case 3: {
        pairs.add(i);
        break;
      }
      default: {
        rest.add(i);
        break;
      }
    }
  }

  const addUtxoWithAssetAmount = (
    inputIndex: Number,
    assetUnit: String,
    set: Set<Number>
  ) => {
    let utxo = utxoMap.get(inputIndex);
    if (!utxo) return;

    let amount = getAssetAmount(utxo, assetUnit);
    if (Number(amount) > 0) {
      selectedInputs.add(inputIndex);
      set.delete(inputIndex);
      for (const asset of utxo.output.amount) {
        totalRequiredAssets.set(
          asset.unit,
          String(
            Number(totalRequiredAssets.get(asset.unit)) - Number(asset.quantity)
          )
        );
      }
    }
  };

  for (const assetUnit of totalRequiredAssets.keys()) {
    if (assetUnit == 'lovelace') continue;
    for (const inputIndex of singletons) {
      let assetRequired = totalRequiredAssets.get(assetUnit);
      if (!assetRequired || Number(assetRequired) <= 0) break;
      addUtxoWithAssetAmount(inputIndex, assetUnit, singletons);
    }

    for (const inputIndex of pairs) {
      let assetRequired = totalRequiredAssets.get(assetUnit);
      if (!assetRequired || Number(assetRequired) <= 0) break;
      addUtxoWithAssetAmount(inputIndex, assetUnit, pairs);
    }

    for (const inputIndex of rest) {
      let assetRequired = totalRequiredAssets.get(assetUnit);
      if (!assetRequired || Number(assetRequired) <= 0) break;
      addUtxoWithAssetAmount(inputIndex, assetUnit, rest);
    }
  }

  for (const inputIndex of onlyLovelace) {
    let assetRequired = totalRequiredAssets.get('lovelace');
    if (!assetRequired || Number(assetRequired) <= 0) break;
    addUtxoWithAssetAmount(inputIndex, 'lovelace', onlyLovelace);
  }

  for (const inputIndex of singletons) {
    let assetRequired = totalRequiredAssets.get('lovelace');
    if (!assetRequired || Number(assetRequired) <= 0) break;
    addUtxoWithAssetAmount(inputIndex, 'lovelace', singletons);
  }

  for (const inputIndex of pairs) {
    let assetRequired = totalRequiredAssets.get('lovelace');
    if (!assetRequired || Number(assetRequired) <= 0) break;
    addUtxoWithAssetAmount(inputIndex, 'lovelace', pairs);
  }

  for (const inputIndex of rest) {
    let assetRequired = totalRequiredAssets.get('lovelace');
    if (!assetRequired || Number(assetRequired) <= 0) break;
    addUtxoWithAssetAmount(inputIndex, 'lovelace', rest);
  }

  for (const assetUnit of totalRequiredAssets.keys()) {
    if (Number(totalRequiredAssets.get(assetUnit)) > 0) return [];
  }

  const selectedUtxos: UTxO[] = [];
  for (const inputIndex of selectedInputs) {
    let utxo = utxoMap.get(inputIndex);
    if (utxo) {
      selectedUtxos.push(utxo);
    }
  }
  return selectedUtxos;
};

const getAssetAmount = (utxo: UTxO, assetUnit: String): String => {
  for (const utxoAsset of utxo.output.amount) {
    if (utxoAsset.unit == assetUnit) return utxoAsset.quantity;
  }
  return '0';
};
