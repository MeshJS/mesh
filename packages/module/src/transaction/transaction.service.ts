import { csl, largestFirstMultiAsset } from '@mesh/core';
import {
  DEFAULT_PROTOCOL_PARAMETERS, DEFAULT_REDEEMER_BUDGET,
  POLICY_ID_LENGTH, SUPPORTED_COST_MODELS,
} from '@mesh/common/constants';
import { IInitiator } from '@mesh/common/contracts';
import { Checkpoint, Trackable, TrackableObject } from '@mesh/common/decorators';
import {
  buildDataCost, buildTxBuilder, buildTxInputsBuilder, buildTxOutputBuilder,
  deserializeEd25519KeyHash, deserializeNativeScript, deserializePlutusScript,
  fromTxUnspentOutput, fromUTF8, resolvePaymentKeyHash, resolveStakeKeyHash,
  toAddress, toBytes, toPlutusData, toRedeemer, toTxUnspentOutput, toValue,
} from '@mesh/common/utils';
import type { Address, TransactionBuilder, TxInputsBuilder } from '@mesh/core';
import type {
  Action, Asset, Data, Era, Mint, Protocol, Quantity, Recipient, Unit, UTxO,
} from '@mesh/common/types';

@Trackable
export class Transaction {
  private _changeAddress?: Address;
  private _recipients = new Map<Recipient, Asset[]>();
  private _totalBurns = new Map<Unit, Quantity>();
  private _totalMints = new Map<Unit, Mint>();

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

  get fee(): string {
    return this._txBuilder.min_fee().to_str();
  }

  get size(): number {
    return this._txBuilder.full_size();
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

      return this._txBuilder.build_tx().to_hex();
    } catch (error) {
      throw new Error(`[Transaction] An error occurred during build: ${error}.`);
    }
  }

  burnAsset(forgeScript: string, asset: Asset): Transaction {
    const totalQuantity = this._totalBurns.has(asset.unit)
      ? csl.BigNum.from_str(this._totalBurns.get(asset.unit) ?? '0')
          .checked_add(csl.BigNum.from_str(asset.quantity)).to_str()
      : asset.quantity;

    this._txBuilder.add_mint_asset(
      deserializeNativeScript(forgeScript),
      csl.AssetName.new(toBytes(asset.unit.slice(POLICY_ID_LENGTH))),
      csl.Int.new_negative(csl.BigNum.from_str(asset.quantity)),
    );

    this._totalBurns.set(asset.unit, totalQuantity);

    return this;
  }

  @Checkpoint()
  mintAsset(forgeScript: string, mint: Mint): Transaction {
    const toAsset = (forgeScript: string, mint: Mint): Asset => {
      const policyId = deserializeNativeScript(forgeScript).hash().to_hex();
      const assetName = fromUTF8(mint.assetName);

      return {
        unit: `${policyId}${assetName}`,
        quantity: mint.assetQuantity,
      };
    };

    const asset = toAsset(forgeScript, mint);

    const existingQuantity = csl.BigNum
      .from_str(this._totalMints.get(asset.unit)?.assetQuantity ?? '0');

    const totalQuantity = existingQuantity
      .checked_add(csl.BigNum.from_str(asset.quantity));

    this._txBuilder.add_mint_asset(
      deserializeNativeScript(forgeScript),
      csl.AssetName.new(toBytes(fromUTF8(mint.assetName))),
      csl.Int.new(csl.BigNum.from_str(asset.quantity)),
    );

    if (this._recipients.has(mint.recipient))
      this._recipients.get(mint.recipient)?.push(asset);
    else this._recipients.set(mint.recipient, [asset]);

    this._totalMints.set(asset.unit, {
      ...mint, assetQuantity: totalQuantity.to_str(),
    });

    return this;
  }

  @Checkpoint()
  redeemValue(
    plutusScript: string, value: UTxO,
    options = {} as Partial<RedeemValueOptions>,
  ): Transaction {
    const utxo = toTxUnspentOutput(value);
    const datum: Data = options.datum ?? {
      alternative: 0, fields: [],
    };
    const redeemer: Action = {
      budget: DEFAULT_REDEEMER_BUDGET,
      index: this._txInputsBuilder.inputs().len(),
      tag: 'SPEND',
      data: {
        alternative: 0,
        fields: [],
      },
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
    recipient: Recipient, assets: Asset[],
  ): Transaction {
    const amount = toValue(assets);
    const multiAsset = amount.multiasset();

    if (amount.is_zero() || multiAsset === undefined)
      return this;

    const txOutputBuilder = buildTxOutputBuilder(
      recipient,
    );

    const txOutput = txOutputBuilder.next()
      .with_asset_and_min_required_coin_by_utxo_cost(multiAsset,
        buildDataCost(this._protocolParameters.coinsPerUTxOSize),
      ).build();

    this._txBuilder.add_output(txOutput);

    return this;
  }

  sendLovelace(
    recipient: Recipient, lovelace: string,
  ): Transaction {
    const txOutputBuilder = buildTxOutputBuilder(
      recipient,
    );

    const txOutput = txOutputBuilder.next()
      .with_coin(csl.BigNum.from_str(lovelace))
      .build();

    this._txBuilder.add_output(txOutput);

    return this;
  }

  @Checkpoint()
  sendValue(
    recipient: Recipient, value: UTxO,
  ): Transaction {
    const amount = toValue(value.output.amount);
    const txOutputBuilder = buildTxOutputBuilder(
      recipient,
    );

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
        .map((address) => {
          return address.startsWith('addr')
            ? resolvePaymentKeyHash(address)
            : resolveStakeKeyHash(address);
        })
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

  private async addBurnInputsIfNeeded() {
    if (
      this._initiator
      && this._totalBurns.size > 0
      && this.notVisited('setTxInputs')
    ) {
      const utxos = await this._initiator.getUsedUtxos();
      const inputs = largestFirstMultiAsset(this._totalBurns,
        utxos.map((utxo) => fromTxUnspentOutput(utxo)),
      ).map((utxo) => toTxUnspentOutput(utxo));

      inputs
        .forEach((utxo) => {
          this._txInputsBuilder.add_input(
            utxo.output().address(),
            utxo.input(),
            utxo.output().amount(),
          );
        });
    }
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
      const collateral = await this._initiator.getUsedCollateral();
      this._txBuilder.set_collateral(buildTxInputsBuilder(collateral));
    }
  }

  private async addRequiredSignersIfNeeded() {
    if (this._initiator && this.notVisited('setRequiredSigners')) {
      const usedAddress = await this._initiator.getUsedAddress();
      const keyHash = resolvePaymentKeyHash(usedAddress.to_bech32());
      this._txBuilder.add_required_signer(deserializeEd25519KeyHash(keyHash));
    }
  }

  private async addTxInputsAsNeeded() {
    this._txBuilder.set_inputs(this._txInputsBuilder);

    if (this.notVisited('setTxInputs')) {
      const availableUtxos = await this.getAvailableUtxos();

      const includeMultiAsset = !this.notVisited('mintAsset')
        || !this.notVisited('sendAssets')
        || !this.notVisited('sendValue');

      const coinSelectionStrategy = includeMultiAsset
        ? csl.CoinSelectionStrategyCIP2.LargestFirstMultiAsset
        : csl.CoinSelectionStrategyCIP2.LargestFirst;

      this._txBuilder.add_inputs_from(availableUtxos, coinSelectionStrategy);
    }

    if (this.notVisited('redeemValue') === false) {
      const costModels =
        this._era && SUPPORTED_COST_MODELS.get(this._era)
          ? SUPPORTED_COST_MODELS.get(this._era)
          : csl.TxBuilderConstants.plutus_vasil_cost_models();

      this._txBuilder.calc_script_data_hash(costModels ?? csl.Costmdls.new());
    }
  }

  private async forgeAssetsIfNeeded() {
    await this.addBurnInputsIfNeeded();

    this._totalMints.forEach((mint, unit) => {
      this._txBuilder.add_json_metadatum(
        csl.BigNum.from_str(mint.label),
        JSON.stringify({
          [`${unit.slice(0, POLICY_ID_LENGTH)}`]: {
            [`${mint.assetName}`]: { ...mint.metadata },
          },
        }),
      );
    });

    this.addMintOutputs();
  }

  private async getAvailableUtxos() {
    const txUnspentOutputs = csl.TransactionUnspentOutputs.new();

    if (this._initiator === undefined)
      return txUnspentOutputs;

    const availableUtxos = await this._initiator
      .getUsedUtxos();

    availableUtxos.forEach((utxo) => {
      txUnspentOutputs.add(utxo);
    });

    return txUnspentOutputs;
  }

  private addMintOutputs() {
    this._recipients.forEach((assets, recipient) => {
      const amount = toValue(assets);
      const multiAsset = amount.multiasset();

      if (multiAsset !== undefined) {
        const txOutputBuilder = buildTxOutputBuilder(
          recipient,
        );

        const txOutput = txOutputBuilder.next()
          .with_asset_and_min_required_coin_by_utxo_cost(multiAsset,
            buildDataCost(this._protocolParameters.coinsPerUTxOSize),
          ).build();

        this._txBuilder.add_output(txOutput);
      }
    });
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
