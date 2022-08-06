import { csl } from '../core';
import { DEFAULT_PROTOCOL_PARAMETERS } from '../common/constants';
import { Checkpoint, Trackable, TrackableObject } from '../common/decorators';
import {
  fromBytes, toAddress, toPlutusData,
  toTxUnspentOutput, toUnitInterval, toValue,
} from '../common/utils';
import { WalletService } from '../wallet';
import type { TransactionBuilder, TransactionOutputBuilder } from '../core';
import type { Asset, Data, Protocol, UTxO } from '../common/types';

@Trackable
export class TransactionService {
  private readonly _txBuilder: TransactionBuilder;
  // private readonly _txInputsBuilder: TxInputsBuilder;
  private readonly _walletService?: WalletService;

  constructor(options?: CreateTxOptions) {
    this._txBuilder = TransactionService.createTxBuilder(options?.parameters);
    // this._txInputsBuilder = csl.TxInputsBuilder.new();
    this._walletService = options?.walletService;
  }

  async build(): Promise<string> {
    try {
      await this.addTxInputsIfNeeded();
      await this.addChangeAddressIfNeeded();
      return fromBytes(this._txBuilder.build_tx().to_bytes());
    } catch (error) {
      throw error;
    }
  }

  @Checkpoint()
  sendAssets(
    address: string, assets: Asset[],
    options = {
      coinsPerByte: DEFAULT_PROTOCOL_PARAMETERS.coinsPerUTxOSize
    } as SendAssetsOptions,
  ): TransactionService {
    const amount = toValue(assets);
    const multiasset = amount.multiasset();

    if (amount.is_zero() || multiasset === undefined)
      return this;

    const txOutputBuilder = TransactionService
      .createTxOutputBuilder(address, options.datum);

    const txOutput = txOutputBuilder.next()
      .with_asset_and_min_required_coin_by_utxo_cost(
        multiasset,
        csl.DataCost.new_coins_per_byte(
          csl.BigNum.from_str(options.coinsPerByte)
        ),
      )
      .build();

    this._txBuilder.add_output(txOutput);

    return this;
  }

  @Checkpoint()
  setChangeAddress(address: string): TransactionService {
    this._txBuilder.add_change_if_needed(toAddress(address));

    return this;
  }

  /* @Checkpoint()
  setCollateral(collateral: UTxO[]): TransactionService {
    const txInputsBuilder = TransactionService.createTxInputsBuilder(collateral);

    this._txBuilder.set_collateral(txInputsBuilder);

    return this;
  } */

  sendLovelace(
    address: string, lovelace: string,
    options = {} as SendLovelaceOptions,
  ): TransactionService {
    const txOutputBuilder = TransactionService
      .createTxOutputBuilder(address, options.datum);
      
    const txOutput = txOutputBuilder.next()
      .with_coin(csl.BigNum.from_str(lovelace))
      .build();

    this._txBuilder.add_output(txOutput);

    return this;
  }

  setMetadata(key: number, json: string): TransactionService {
    this._txBuilder.add_json_metadatum_with_schema(
      csl.BigNum.from_str(key.toString()),
      json, csl.MetadataJsonSchema.DetailedSchema
    );

    return this;
  }

  setTimeToLive(slot: string): TransactionService {
    this._txBuilder.set_ttl_bignum(csl.BigNum.from_str(slot));

    return this;
  }

  @Checkpoint()
  setTxInputs(inputs: UTxO[]): TransactionService {
    const txInputsBuilder = csl.TxInputsBuilder.new();

    inputs
      .map((input) => toTxUnspentOutput(input))
      .forEach((utxo) => {
        txInputsBuilder.add_input(
          utxo.output().address(),
          utxo.input(),
          utxo.output().amount()
        );
      });

    this._txBuilder.set_inputs(txInputsBuilder);

    return this;
  }

  private static createTxBuilder(
    parameters = DEFAULT_PROTOCOL_PARAMETERS
  ): TransactionBuilder {
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
  }

  private static createTxOutputBuilder(
    address: string,
    datum?: Data
  ): TransactionOutputBuilder {
    const txOutputBuilder = csl.TransactionOutputBuilder.new()
      .with_address(toAddress(address))

    if (datum !== undefined) {
      const plutusData = toPlutusData(datum);
      const dataHash = csl.hash_plutus_data(plutusData);

      txOutputBuilder.with_plutus_data(plutusData)
        .with_data_hash(dataHash);
    }

    return txOutputBuilder;
  }

  /* private addTxInputs(utxos: UTxO[]) {
    utxos
      .map((utxo) => toTxUnspentOutput(utxo))
      .forEach((utxo) => {
        this._txInputsBuilder.add_input(
          utxo.output().address(),
          utxo.input(),
          utxo.output().amount(),
        );
      });
  } */

  private async addChangeAddressIfNeeded() {
    if (this._walletService !== undefined && this.notReached('setChangeAddress')) {
      const changeAddress = await this._walletService.getChangeAddress();
      this._txBuilder.add_change_if_needed(toAddress(changeAddress));
    }
  }

  private async addTxInputsIfNeeded() {
    if (this.notReached('setTxInputs')) {
      const walletUtxos = await this.getWalletUtxos();

      const coinSelectionStrategy = !this.notReached('sendAssets')
        ? csl.CoinSelectionStrategyCIP2.LargestFirstMultiAsset
        : csl.CoinSelectionStrategyCIP2.LargestFirst;

      this._txBuilder.add_inputs_from(walletUtxos, coinSelectionStrategy);
    }
  }

  private async getWalletUtxos() {
    const txUnspentOutputs = csl.TransactionUnspentOutputs.new();

    if (this._walletService === undefined)
      return txUnspentOutputs;

    const walletUtxos = await this._walletService
      .getDeserializedUtxos();

    walletUtxos.forEach((utxo) => {
      txUnspentOutputs.add(utxo);
    });

    return txUnspentOutputs;
  }

  /* private getRequiredSigners() {
    const inputs = [...utxos, ...collateral];

    const addresses = new Set();
    inputs.forEach((utxo) => {
      addresses.add(utxo.output().address().to_bech32());
    });
    addresses.delete(scriptInput.output().address().to_bech32());

    const requiredSigners = csl.Ed25519KeyHashes.new();
    addresses.forEach((address) => {
      const keyHash = resolveAddressKeyHash(address);
      requiredSigners.add(keyHash);
    });

    return requiredSigners;
  } */

  private notReached(checkpoint: string) {
    return (
      (this as unknown as TrackableObject).__visits
        .includes(checkpoint) === false
    );
  }
}

type CreateTxOptions = {
  parameters?: Protocol;
  walletService?: WalletService;
};

type SendAssetsOptions = {
  coinsPerByte: string;
  datum?: Data;
};

type SendLovelaceOptions = {
  datum?: Data;
};
