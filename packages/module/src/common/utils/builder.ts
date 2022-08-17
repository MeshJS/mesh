import { csl } from '@mesh/core';
import { DEFAULT_PROTOCOL_PARAMETERS } from '@mesh/common/constants';
import {
  toAddress, toPlutusData, toTxUnspentOutput, toUnitInterval,
} from './converter';
import type {
  TransactionBuilder, TransactionOutputBuilder,
  TransactionUnspentOutput, TxInputsBuilder,
} from '@mesh/core';
import type { Data, UTxO } from '@mesh/common/types';

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
    .prefer_pure_change(false)
    .build();

  return csl.TransactionBuilder.new(txBuilderConfig);
};

export const buildTxInputsBuilder = (
  utxos: unknown[],
): TxInputsBuilder => {
  const txInputsBuilder = csl.TxInputsBuilder.new();

  utxos
    .map((utxo) => {
      return utxo instanceof csl.TransactionUnspentOutput
        ? utxo as TransactionUnspentOutput
        : toTxUnspentOutput(utxo as UTxO);
    })
    .forEach((utxo) => {
      txInputsBuilder.add_input(
        utxo.output().address(),
        utxo.input(),
        utxo.output().amount()
      );
    });

  return txInputsBuilder;
};

export const buildTxOutputBuilder = (
  address: string, datum?: Data
): TransactionOutputBuilder => {
  if (datum === undefined)
    return csl.TransactionOutputBuilder.new()
      .with_address(toAddress(address));

  const plutusData = toPlutusData(datum);
  const dataHash = csl.hash_plutus_data(plutusData);

  return csl.TransactionOutputBuilder.new()
    .with_address(toAddress(address))
    .with_plutus_data(plutusData)
    .with_data_hash(dataHash);
};
