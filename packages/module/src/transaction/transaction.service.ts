import { csl } from '@mesh/core';
import {
  DEFAULT_PROTOCOL_PARAMETERS, DEFAULT_REDEEMER_BUDGET,
  POLICY_ID_LENGTH, SUPPORTED_COST_MODELS,
} from '@mesh/common/constants';
import { IInitiator } from '@mesh/common/contracts';
import {
  Checkpoint, Trackable, TrackableObject,
} from '@mesh/common/decorators';
import {
  buildDataCost, buildTxBuilder, buildTxInputsBuilder,
  buildTxOutputBuilder, deserializeEd25519KeyHash,
  deserializeNativeScript, deserializePlutusScript,
  fromBytes, fromUTF8, resolveKeyHash, toAddress, toBytes,
  toPlutusData, toRedeemer, toTxUnspentOutput, toValue,
} from '@mesh/common/utils';
import type { Address, TransactionBuilder, TxInputsBuilder } from '@mesh/core';
import type {
  Action, Asset, AssetRaw, Data, Era, Protocol, UTxO,
} from '@mesh/common/types';

@Trackable
export class Transaction {
  private _changeAddress: Address | undefined;
  private _mintRecipients = new Map<Address, Asset[]>();
  private _totalMints = new Map<string, AssetRaw>();

  private readonly _era?: Era;
  private readonly _initiator?: IInitiator;
  private readonly _protocolParameters: Protocol;
  private readonly _txBuilder: TransactionBuilder;
  private readonly _txInputsBuilder: TxInputsBuilder;

  constructor(options = {} as Partial<CreateTxOptions>) {
    this._era = options.era;
    this._initiator = options.initiator;
    this._protocolParameters = options.parameters ?? DEFAULT_PROTOCOL_PARAMETERS;
    this._txBuilder = buildTxBuilder(options.parameters);
    this._txInputsBuilder = csl.TxInputsBuilder.new();
  }

  async build(): Promise<string> {
    try {
      if (this.notVisited('redeemValue') === false) {
        await this.addCollateralIfNeeded();
        await this.addRequiredSignersIfNeeded();
      }

      await this.forgeAssetsIfNeeded();
      await this.addTxInputsAsNeeded();
      await this.addChangeAddress();

      return fromBytes(this._txBuilder.build_tx().to_bytes());
    } catch (error) {
      throw error;
    }
  }

  burnAsset(forgeScript: string, asset: Asset): Transaction {
    this._txBuilder.add_mint_asset(
      deserializeNativeScript(forgeScript),
      csl.AssetName.new(toBytes(asset.unit.slice(POLICY_ID_LENGTH))),
      csl.Int.new_negative(csl.BigNum.from_str(asset.quantity)),
    );

    return this;
  }

  mintAsset(
    forgeScript: string, recipientAddress: string, assetRaw: AssetRaw,
  ): Transaction {
    this._txBuilder.add_mint_asset(
      deserializeNativeScript(forgeScript),
      csl.AssetName.new(toBytes(fromUTF8(assetRaw.name))),
      csl.Int.from_str(assetRaw.quantity),
    );

    const recipient = toAddress(recipientAddress);

    const policyId = deserializeNativeScript(forgeScript)
      .hash().to_hex();

    const assetName = fromUTF8(assetRaw.name);

    const asset: Asset = {
      unit: `${policyId}${assetName}`,
      quantity: assetRaw.quantity,
    };

    if (this._mintRecipients.has(recipient)) {
      this._mintRecipients.get(recipient)?.push(asset);
    } else {
      this._mintRecipients.set(recipient, [asset]);
    }

    this._totalMints.set(`${policyId}${assetName}`, assetRaw);

    return this;
  }

  @Checkpoint()
  redeemValue(
    plutusScript: string, value: UTxO,
    options = {} as Partial<RedeemValueOptions>,
  ): Transaction {
    const utxo = toTxUnspentOutput(value);
    const datum: Data = options.datum ?? [];
    const redeemer: Action = {
      alternative: 0,
      budget: DEFAULT_REDEEMER_BUDGET,
      data: [] as Data,
      index: this._txInputsBuilder.inputs().len(),
      tag: 'SPEND',
      ...options.redeemer,
    };

    const plutusWitness = csl.PlutusWitness.new(
      deserializePlutusScript(plutusScript),
      toPlutusData(datum),
      toRedeemer(redeemer),
    );

    this._txInputsBuilder.add_plutus_script_input(
      plutusWitness, utxo.input(), utxo.output().amount(),
    );

    return this;
  }

  @Checkpoint()
  sendAssets(
    address: string, assets: Asset[],
    options = {} as Partial<SendAssetsOptions>,
  ): Transaction {
    const amount = toValue(assets);
    const multiAsset = amount.multiasset();

    if (amount.is_zero() || multiAsset === undefined)
      return this;

    const txOutputBuilder = buildTxOutputBuilder(address, options.datum);

    const txOutput = txOutputBuilder.next()
      .with_asset_and_min_required_coin_by_utxo_cost(
        multiAsset,
        buildDataCost(this._protocolParameters.coinsPerUTxOSize),
      )
      .build();

    this._txBuilder.add_output(txOutput);

    return this;
  }

  sendLovelace(
    address: string, lovelace: string,
    options = {} as Partial<SendLovelaceOptions>,
  ): Transaction {
    const txOutputBuilder = buildTxOutputBuilder(address, options.datum);

    const txOutput = txOutputBuilder.next()
      .with_coin(csl.BigNum.from_str(lovelace))
      .build();

    this._txBuilder.add_output(txOutput);

    return this;
  }

  @Checkpoint()
  sendValue(
    address: string, value: UTxO,
    options = {} as Partial<SendValueOptions>,
  ): Transaction {
    const amount = toValue(value.output.amount);
    const txOutputBuilder = buildTxOutputBuilder(address, options.datum);

    const txOutput = txOutputBuilder.next()
      .with_value(amount)
      .build();

    this._txBuilder.add_output(txOutput);

    return this;
  }

  setChangeAddress(address: string): Transaction {
    this._changeAddress = toAddress(address);

    return this;
  }

  @Checkpoint()
  setCollateral(collateral: UTxO[]): Transaction {
    const txInputsBuilder = buildTxInputsBuilder(collateral);

    this._txBuilder.set_collateral(txInputsBuilder);

    return this;
  }

  setMetadata(key: number, json: string): Transaction {
    this._txBuilder.add_json_metadatum_with_schema(
      csl.BigNum.from_str(key.toString()),
      json, csl.MetadataJsonSchema.NoConversions,
    );

    return this;
  }

  @Checkpoint()
  setRequiredSigners(addresses: string[]) {
    const signatures = Array.from(new Set(
      addresses
        .map((address) => resolveKeyHash(address))
        .map((keyHash) => deserializeEd25519KeyHash(keyHash))
    ));

    signatures.forEach((signature) => {
      this._txBuilder.add_required_signer(signature);
    });

    return this;
  }

  setTimeToLive(slot: string): Transaction {
    this._txBuilder.set_ttl_bignum(csl.BigNum.from_str(slot));

    return this;
  }

  @Checkpoint()
  setTxInputs(inputs: UTxO[]): Transaction {
    inputs
      .map((input) => toTxUnspentOutput(input))
      .forEach((utxo) => {
        this._txInputsBuilder.add_input(
          utxo.output().address(),
          utxo.input(),
          utxo.output().amount(),
        );
      });

    return this;
  }

  private async addChangeAddress() {
    if (this._initiator && this._changeAddress === undefined) {
      const change = await this._initiator.getUsedAddress();
      this._txBuilder.add_change_if_needed(change);
    } else if (this._changeAddress !== undefined) {
      this._txBuilder.add_change_if_needed(this._changeAddress);
    }
  }

  private async addCollateralIfNeeded() {
    if (this._initiator && this.notVisited('setCollateral')) {
      const collateral = await this._initiator.getCollateralInput();
      this._txBuilder.set_collateral(buildTxInputsBuilder(collateral));
    }
  }

  private async addRequiredSignersIfNeeded() {
    if (this._initiator && this.notVisited('setRequiredSigners')) {
      const usedAddress = await this._initiator.getUsedAddress();
      const keyHash = resolveKeyHash(usedAddress.to_bech32());
      this._txBuilder.add_required_signer(deserializeEd25519KeyHash(keyHash));
    }
  }

  private async addTxInputsAsNeeded() {
    this._txBuilder.set_inputs(this._txInputsBuilder);

    if (this.notVisited('setTxInputs')) {
      const availableUtxos = await this.getAvailableUtxos();

      // const includeMultiAsset =
      //   !this.notVisited('sendAssets') || !this.notVisited('sendValue');

      const coinSelectionStrategy = true // includeMultiAsset
        ? csl.CoinSelectionStrategyCIP2.LargestFirstMultiAsset
        : csl.CoinSelectionStrategyCIP2.LargestFirst;

      this._txBuilder.add_inputs_from(availableUtxos, coinSelectionStrategy);
    }

    if (this.notVisited('redeemValue') === false) {
      const costModels =
        this._era && SUPPORTED_COST_MODELS.get(this._era)
          ? SUPPORTED_COST_MODELS.get(this._era)!
          : csl.TxBuilderConstants.plutus_vasil_cost_models();

      this._txBuilder.calc_script_data_hash(costModels);
    }
  }

  private async forgeAssetsIfNeeded() {
    this._mintRecipients.forEach((assets, recipient) => {
      const amount = toValue(assets);
      const multiAsset = amount.multiasset();

      if (multiAsset !== undefined) {
        const txOutputBuilder = buildTxOutputBuilder(recipient.to_bech32());

        const txOutput = txOutputBuilder.next()
          .with_asset_and_min_required_coin_by_utxo_cost(
            multiAsset,
            buildDataCost(this._protocolParameters.coinsPerUTxOSize),
          )
          .build();

        this._txBuilder.add_output(txOutput);
      }
    });

    this._totalMints.forEach((assetRaw, unit) => {
      const metadata = {
        [`${unit.slice(0, POLICY_ID_LENGTH)}`]: {
          [`${assetRaw.name}`]: {
            ...assetRaw.metadata
          }
        }
      }
      this._txBuilder.add_json_metadatum(
        csl.BigNum.from_str(assetRaw.label),
        JSON.stringify(metadata),
      );
    });
  }

  private async getAvailableUtxos() {
    const txUnspentOutputs = csl.TransactionUnspentOutputs.new();

    if (this._initiator === undefined)
      return txUnspentOutputs;

    const availableUtxos = await this._initiator
      .getAvailableUtxos();

    availableUtxos.forEach((utxo) => {
      txUnspentOutputs.add(utxo);
    });

    return txUnspentOutputs;
  }

  private notVisited(checkpoint: string) {
    return (
      (this as unknown as TrackableObject).__visits
        .includes(checkpoint) === false
    );
  }
}

type CreateTxOptions = {
  era: Era;
  initiator: IInitiator;
  parameters: Protocol;
};

type RedeemValueOptions = {
  datum: Data;
  redeemer: Action;
};

type SendAssetsOptions = {
  datum: Data;
};

type SendLovelaceOptions = {
  datum: Data;
};

type SendValueOptions = {
  datum: Data;
};
