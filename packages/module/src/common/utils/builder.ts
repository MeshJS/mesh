import { csl } from '../../core';
import { DEFAULT_PROTOCOL_PARAMETERS } from '../constants';
import {
  toAddress, toBytes, toPlutusData,
  toTxUnspentOutput, toUnitInterval,
} from './converter';
import type {
  PlutusData, Redeemer, RedeemerTag,
  TransactionBuilder, TransactionOutputBuilder,
  TransactionUnspentOutput, TxInputsBuilder,
} from '../../core';
import type { Data, DataContent, UTxO } from '../types';

export const buildPlutusData = (content: DataContent): PlutusData => {
  switch (typeof content) {
    case 'string':
      return csl.PlutusData.new_bytes(toBytes(content));
    case 'number':
      return csl.PlutusData.new_integer(
        csl.BigInt.from_str(content.toString())
      );
    case 'object':
      if (Array.isArray(content)) {
        const plutusList = csl.PlutusList.new();
        content.forEach((element) => {
          plutusList.add(buildPlutusData(element));
        });
        return csl.PlutusData.new_list(plutusList);
      } else {
        const plutusMap = csl.PlutusMap.new();
        Object.keys(content).forEach((key) => {
          plutusMap.insert(buildPlutusData(key), buildPlutusData(content[key]));
        });
        return csl.PlutusData.new_map(plutusMap);
      }
    default:
      throw new Error(`Couldn't build PlutusData of type: ${typeof content}.`);
  }
};

export const buildRedeemer = (
  redeemerIndex: number,
  redeemerTag: RedeemerTag,
  data: Data,
  memBudget = 7000000,
  stepsBudget = 3000000000
): Redeemer =>
  csl.Redeemer.new(
    redeemerTag,
    csl.BigNum.from_str(redeemerIndex.toString()),
    toPlutusData(data),
    csl.ExUnits.new(
      csl.BigNum.from_str(memBudget.toString()),
      csl.BigNum.from_str(stepsBudget.toString())
    )
  );

export const buildTxBuilder = (
  parameters = DEFAULT_PROTOCOL_PARAMETERS
): TransactionBuilder => {
  const txBuilderConfig = csl.TransactionBuilderConfigBuilder.new()
    .coins_per_utxo_byte(csl.BigNum.from_str(parameters.coinsPerUTxOSize))
    .ex_unit_prices(
      csl.ExUnitPrices.new(
        toUnitInterval(parameters.priceMem.toString()),
        toUnitInterval(parameters.priceStep.toString())
      )
    )
    .fee_algo(
      csl.LinearFee.new(
        csl.BigNum.from_str(parameters.minFeeA.toString()),
        csl.BigNum.from_str(parameters.minFeeB.toString())
      )
    )
    .key_deposit(csl.BigNum.from_str(parameters.keyDeposit))
    .max_tx_size(parameters.maxTxSize)
    .max_value_size(parseInt(parameters.maxValSize))
    .pool_deposit(csl.BigNum.from_str(parameters.poolDeposit))
    .build();

  return csl.TransactionBuilder.new(txBuilderConfig);
};

export const buildTxInputBuilder = (
  utxos: unknown[],
): TxInputsBuilder => {
  const txInputBuilder = csl.TxInputsBuilder.new();

  utxos
    .map((utxo) => {
      return utxo instanceof csl.TransactionUnspentOutput
        ? utxo as TransactionUnspentOutput
        : toTxUnspentOutput(utxo as UTxO);
    })
    .forEach((utxo: TransactionUnspentOutput) => {
      txInputBuilder.add_input(
        utxo.output().address(),
        utxo.input(),
        utxo.output().amount()
      );
    });

  return txInputBuilder;
};

export const buildTxOutputBuilder = (
  address: string, datum?: Data
): TransactionOutputBuilder => {
  if (datum === undefined)
    return csl.TransactionOutputBuilder.new().with_address(toAddress(address));

  const plutusData = toPlutusData(datum);
  const dataHash = csl.hash_plutus_data(plutusData);

  return csl.TransactionOutputBuilder.new()
    .with_address(toAddress(address))
    .with_plutus_data(plutusData)
    .with_data_hash(dataHash);
};
