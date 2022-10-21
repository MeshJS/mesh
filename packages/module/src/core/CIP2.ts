import { csl } from './CSL';
import {
  DEFAULT_PROTOCOL_PARAMETERS,
} from '@mesh/common/constants';
import { resolveTxFees } from '@mesh/common/utils';
import type { Quantity, Unit, UTxO } from '@mesh/common/types';

export const largestFirst = (
  lovelace: Quantity, initialUTxOSet: UTxO[], includeTxFees = false,
  { maxTxSize, minFeeA, minFeeB } = DEFAULT_PROTOCOL_PARAMETERS,
): UTxO[] => {
  const sortedUTxOs = initialUTxOSet
    .filter((utxo) => multiAssetUTxO(utxo) === false)
    .sort(largestLovelaceQuantity);

  const maxTxFees = csl.BigNum.from_str(
    resolveTxFees(maxTxSize, minFeeA, minFeeB),
  );

  const quantity = includeTxFees
    ? csl.BigNum.from_str(lovelace).checked_add(maxTxFees).to_str()
    : lovelace;

  const requestedOutputSet = new Map<Unit, Quantity>([
    ['lovelace', quantity],
  ]);

  const selection = selectValue(
    sortedUTxOs, requestedOutputSet,
  );

  return selection;
};

export const largestFirstMultiAsset = (
  requestedOutputSet: Map<Unit, Quantity>, initialUTxOSet: UTxO[],
  includeTxFees = false, parameters = DEFAULT_PROTOCOL_PARAMETERS,
): UTxO[] => {
  const sortedMultiAssetUTxOs = initialUTxOSet
    .filter(multiAssetUTxO)
    .sort(largestLovelaceQuantity);

  const lovelace = requestedOutputSet.get('lovelace') ?? '0';

  const { maxTxSize, minFeeA, minFeeB } = parameters;
  const maxTxFees = csl.BigNum.from_str(
    resolveTxFees(maxTxSize, minFeeA, minFeeB),
  );

  const quantity = includeTxFees
    ? csl.BigNum.from_str(lovelace).checked_add(maxTxFees).to_str()
    : lovelace;

  requestedOutputSet.set('lovelace', quantity);

  const selection = selectValue(
    sortedMultiAssetUTxOs,
    requestedOutputSet,
  );

  return selection;
};

const enoughValueHasBeenSelected = (
  selection: UTxO[], assets: Map<Unit, Quantity>,
): boolean => {
  return Array
    .from(
      assets, (asset) => ({ unit: asset[0], quantity: csl.BigNum.from_str(asset[1]) }),
    )
    .every((asset) => {
      return selection
        .filter((utxo) => {
          return utxo.output.amount
            .find((a) => a.unit === asset.unit) !== undefined;
        })
        .reduce((selectedQuantity, utxo) => {
          const utxoQuantity = utxo.output.amount
            .reduce(
              (quantity, a) => quantity.checked_add(csl.BigNum.from_str(a.quantity)),
              csl.BigNum.from_str('0'),
            );

          return selectedQuantity.checked_add(utxoQuantity);
        }, csl.BigNum.from_str('0')).less_than(asset.quantity) === false;
    });
};

const largestLovelaceQuantity = (
  utxoA: UTxO, utxoB: UTxO,
): number => {
  const aLovelaceQuantity = csl.BigNum.from_str(
    utxoA.output.amount.find((asset) => asset.unit === 'lovelace')?.quantity ?? '0',
  );

  const bLovelaceQuantity = csl.BigNum.from_str(
    utxoB.output.amount.find((asset) => asset.unit === 'lovelace')?.quantity ?? '0',
  );

  return bLovelaceQuantity.compare(aLovelaceQuantity);
};

const multiAssetUTxO = (
  utxo: UTxO,
): boolean => utxo.output.amount.length > 1;

const selectValue = (
  inputUTxO: UTxO[],
  outputSet: Map<Unit, Quantity>,
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
    outputSet, selection,
  );
};

const valueCanBeSelected = (
  utxo: UTxO, assets: Map<Unit, Quantity>,
): boolean => {
  return Array.from(assets.keys()).some((unit) => {
    return utxo.output.amount
      .find((asset) => asset.unit === unit) !== undefined;
  });
};
