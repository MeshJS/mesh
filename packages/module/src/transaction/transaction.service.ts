import { csl } from '../core';
import { DEFAULT_PROTOCOL_PARAMETERS } from '../common/constants';
import {
  fromBytes, toAddress, toTxUnspentOutput, toUnitInterval, toValue
} from '../common/utils';
import { WalletService } from '../wallet';
import type { TransactionBuilder } from '../core';
import type { Asset, Metadata, Protocol, UTxO } from '../common/types';

export class TransactionService {
  private readonly _txBuilder: TransactionBuilder;

  constructor(
    private readonly _walletService: WalletService,
    parameters?: Protocol,
  ) {
    this._txBuilder = TransactionService.createTxBuilder(parameters);
  }

  private _checkList = {
    changeAddressSet: false,
    nativeAssetsSet: false,
    txInputsSet: false,
  };

  sendLovelace(address: string, lovelace: string): TransactionService {
    const txOutput = csl.TransactionOutputBuilder.new()
      .with_address(toAddress(address))
      .next()
      .with_coin(csl.BigNum.from_str(lovelace))
      .build();

    this._txBuilder.add_output(txOutput);

    return this;
  }

  sendNativeAssets(
    address: string,
    nativeAssets: Asset[],
    coinsPerByte = DEFAULT_PROTOCOL_PARAMETERS.coinsPerUTxOSize,
  ): TransactionService {
    const amount = toValue(nativeAssets);
    const multiasset = amount.multiasset();

    if (amount.is_zero() || multiasset === undefined) {
      return this;
    }

    const txOutput = csl.TransactionOutputBuilder.new()
      .with_address(toAddress(address))
      .next()
      .with_asset_and_min_required_coin_by_utxo_cost(
        multiasset,
        csl.DataCost.new_coins_per_byte(
          csl.BigNum.from_str(coinsPerByte)
        )
      )
      .build();

    this._txBuilder.add_output(txOutput);

    this._checkList.nativeAssetsSet = true;

    return this;
  }

  setChangeAddress(address: string): TransactionService {
    this._txBuilder.add_change_if_needed(toAddress(address));

    this._checkList.changeAddressSet = true;

    return this;
  }

  setMetadata(key: number, value: Metadata): TransactionService {
    this._txBuilder.add_json_metadatum_with_schema(
      csl.BigNum.from_str(key.toString()),
      JSON.stringify(value),
      csl.MetadataJsonSchema.DetailedSchema
    );

    return this;
  }

  setTimeToLive(slot: string): TransactionService {
    this._txBuilder.set_ttl_bignum(csl.BigNum.from_str(slot));

    return this;
  }

  setTxInputs(inputs: UTxO[]): TransactionService {
    const txInputsBuilder = csl.TxInputsBuilder.new();

    inputs
      .map((input) => toTxUnspentOutput(input))
      .forEach((utxo) => {
        txInputsBuilder.add_input(
          utxo.output().address(),
          utxo.input(),
          utxo.output().amount(),
        )
      });

    this._txBuilder.set_inputs(txInputsBuilder);

    this._checkList.txInputsSet = true;

    return this;
  }

  async build(): Promise<string> {
    try {
      await this.addInputIfNeeded();
      await this.addChangeIfNeeded();

      const tx = this._txBuilder.build_tx();

      return fromBytes(tx.to_bytes());
    } catch (error) {
      throw error;
    }
  }

  private static createTxBuilder(
    parameters = DEFAULT_PROTOCOL_PARAMETERS
  ): TransactionBuilder {
    const txBuilderConfig = csl.TransactionBuilderConfigBuilder.new()
      .coins_per_utxo_byte(
        csl.BigNum.from_str(parameters.coinsPerUTxOSize)
      )
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
  }

  private async addChangeIfNeeded() {
    if (this._checkList.changeAddressSet === false) {
      const changeAddress = await this._walletService.getChangeAddress();
      this._txBuilder.add_change_if_needed(toAddress(changeAddress));
    }
  }

  private async addInputIfNeeded() {
    if (this._checkList.txInputsSet === false) {
      const walletUtxos = await this.getWalletUtxos();

      const coinSelectionStrategy = this._checkList.nativeAssetsSet
        ? csl.CoinSelectionStrategyCIP2.LargestFirstMultiAsset
        : csl.CoinSelectionStrategyCIP2.LargestFirst;

      this._txBuilder.add_inputs_from(
        walletUtxos, coinSelectionStrategy
      );
    }
  }

  private async getWalletUtxos() {
    const txUnspentOutputs = csl.TransactionUnspentOutputs.new();
    const walletUtxos = await this._walletService.getDeserializedUtxos();

    walletUtxos.forEach((utxo) => {
      txUnspentOutputs.add(utxo);
    });

    return txUnspentOutputs;
  }
}
