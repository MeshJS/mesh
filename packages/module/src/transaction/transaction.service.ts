import { csl } from '../core';
import { DEFAULT_PROTOCOL_PARAMETERS } from '../common/constants';
import { Checkpoint, Trackable, TrackableObject } from '../common/decorators';
import {
  buildTxBuilder, buildTxInputBuilder, buildTxOutputBuilder,
  deserializeEd25519KeyHash, deserializePlutusScript,
  fromBytes, fromTxUnspentOutput, resolveAddressKeyHash, toAddress,
  toPlutusData, toTxUnspentOutput, toValue,
} from '../common/utils';
import { WalletService } from '../wallet';
import type { TransactionBuilder,TxInputsBuilder } from '../core';
import type { Asset, Data, Protocol, UTxO } from '../common/types';

@Trackable
export class TransactionService {
  private readonly _txBuilder: TransactionBuilder;
  private readonly _txInputsBuilder: TxInputsBuilder;
  private readonly _txSigners: Set<string>;
  private readonly _walletService?: WalletService;

  constructor(options = {} as CreateTxOptions) {
    this._txBuilder = buildTxBuilder(options.parameters);
    this._txInputsBuilder = csl.TxInputsBuilder.new();
    this._txSigners = new Set<string>();
    this._walletService = options.walletService;
  }

  async build(): Promise<string> {
    try {
      await this.addCollateralIfNeeded();
      await this.addRequiredSignersIfNeeded();
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
      coinsPerByte: DEFAULT_PROTOCOL_PARAMETERS.coinsPerUTxOSize,
    } as SendAssetsOptions
  ): TransactionService {
    const amount = toValue(assets);
    const multiasset = amount.multiasset();

    if (amount.is_zero() || multiasset === undefined)
      return this;

    const txOutputBuilder = buildTxOutputBuilder(address, options.datum);

    const txOutput = txOutputBuilder.next()
      .with_asset_and_min_required_coin_by_utxo_cost(
        multiasset,
        csl.DataCost.new_coins_per_byte(
          csl.BigNum.from_str(options.coinsPerByte)
        )
      )
      .build();

    this._txBuilder.add_output(txOutput);

    return this;
  }

  sendLovelace(
    address: string, lovelace: string,
    options = {} as SendLovelaceOptions
  ): TransactionService {
    const txOutputBuilder = buildTxOutputBuilder(address, options.datum);

    const txOutput = txOutputBuilder.next()
      .with_coin(csl.BigNum.from_str(lovelace))
      .build();

    this._txBuilder.add_output(txOutput);

    return this;
  }

  @Checkpoint()
  setChangeAddress(address: string): TransactionService {
    this._txBuilder.add_change_if_needed(toAddress(address));

    return this;
  }

  @Checkpoint()
  setCollateral(collateral: UTxO[]): TransactionService {
    const txInputsBuilder = buildTxInputBuilder(collateral);

    this._txBuilder.set_collateral(txInputsBuilder);
    this.addTxSignersFrom(collateral);

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
    const txInputsBuilder = buildTxInputBuilder(inputs);

    this._txBuilder.set_inputs(txInputsBuilder);
    this.addTxSignersFrom(inputs);

    return this;
  }

  @Checkpoint()
  spendFromScript(
    script: string,
    datum: Data,
    amount: UTxO,
  ): TransactionService {
    const assetUtxo = toTxUnspentOutput(amount);
    const plutusWitness = csl.PlutusWitness.new(
      deserializePlutusScript(script),
      toPlutusData(datum),
      this.getRedeemer(assetUtxo.input().index().toString()),
    );

    this._txInputsBuilder.add_plutus_script_input(
      plutusWitness,
      assetUtxo.input(),
      assetUtxo.output().amount()
    );

    this._txBuilder.calc_script_data_hash(
      csl.TxBuilderConstants.plutus_vasil_cost_models(),
    );

    return this;
  }

  private async addChangeAddressIfNeeded() {
    if (this._walletService && this.notVisited('setChangeAddress')) {
      const changeAddress = await this._walletService.getChangeAddress();
      this._txBuilder.add_change_if_needed(toAddress(changeAddress));
    }
  }

  private async addCollateralIfNeeded() {
    if (!this.notVisited('spendFromScript')) {
      if (this._walletService && this.notVisited('setCollateral')) {
        const collateral = await this._walletService
          .getDeserializedCollateral();

        this._txBuilder.set_collateral(
          buildTxInputBuilder(collateral)
        );

        this.addTxSignersFrom(
          collateral.map((c) => fromTxUnspentOutput(c))
        );
      }
    }
  }

  private async addRequiredSignersIfNeeded() {
    if (!this.notVisited('spendFromScript')) {
      const keys = csl.Ed25519KeyHashes.new();

      this._txSigners.forEach((signature) => {
        keys.add(deserializeEd25519KeyHash(signature));
      });

      this._txInputsBuilder.add_required_signers(keys);
      this._txBuilder.set_inputs(this._txInputsBuilder);
    }
  }

  private async addTxInputsIfNeeded() {
    if (this.notVisited('setTxInputs')) {
      const walletUtxos = await this.getWalletUtxos();

      const coinSelectionStrategy = !this.notVisited('sendAssets')
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

  private addTxSignersFrom(inputs: UTxO[]) {
    inputs
      .forEach((utxo) => {
        const address = utxo.output.address;
        const keyHash = resolveAddressKeyHash(address);
        this._txSigners.add(keyHash);
      });
  }

  private notVisited(checkpoint: string) {
    return (
      (this as unknown as TrackableObject).__visits
        .includes(checkpoint) === false
    );
  }

  ////////
  getRedeemer(index) {
    const data = csl.PlutusData.new_constr_plutus_data(
      csl.ConstrPlutusData.new(csl.BigNum.from_str('0'), csl.PlutusList.new())
    );

    const redeemer = csl.Redeemer.new(
      csl.RedeemerTag.new_spend(),
      csl.BigNum.from_str(index),
      data,
      csl.ExUnits.new(
        csl.BigNum.from_str('7000000'),
        csl.BigNum.from_str('3000000000')
      )
    );

    return redeemer;
  }
  ////////
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
