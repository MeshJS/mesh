import { csl, largestFirst, largestFirstMultiAsset } from '@mesh/core';
import {
  DEFAULT_PROTOCOL_PARAMETERS, DEFAULT_REDEEMER_BUDGET,
  POLICY_ID_LENGTH, SUPPORTED_COST_MODELS,
} from '@mesh/common/constants';
import { IInitiator } from '@mesh/common/contracts';
import { Checkpoint, Trackable, TrackableObject } from '@mesh/common/decorators';
import {
  buildDataCost, buildDatumSource, buildPlutusScriptSource,
  buildTxBuilder, buildTxInputsBuilder, buildTxOutputBuilder,
  deserializeEd25519KeyHash, deserializeNativeScript, deserializeTx,
  fromTxUnspentOutput, fromUTF8, resolvePaymentKeyHash, resolveStakeKeyHash,
  toAddress, toBytes, toRedeemer, toTxUnspentOutput, toValue,
} from '@mesh/common/utils';
import type { Address, TransactionBuilder, TxInputsBuilder } from '@mesh/core';
import type {
  Action, Asset, AssetMetadata, Data, Era, Mint, Protocol,
  PlutusScript, Quantity, Recipient, Unit, UTxO,
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

  get size(): number {
    return this._txBuilder.full_size();
  }

  static maskMetadata(cborTx: string) {
    const tx = deserializeTx(cborTx);
    const txMetadata = tx.auxiliary_data()?.metadata();

    if (txMetadata !== undefined) {
      const mockMetadata = csl.GeneralTransactionMetadata.new();
      for (let index = 0; index < txMetadata.len(); index += 1) {
        const label = txMetadata.keys().get(index);
        const metadatum = txMetadata.get(label);

        mockMetadata.insert(
          label, csl.TransactionMetadatum.from_hex(
            '0'.repeat((metadatum?.to_hex() ?? '').length),
          ),
        );
      }

      const txAuxData = tx.auxiliary_data();
      txAuxData?.set_metadata(mockMetadata);

      return csl.Transaction.new(
        tx.body(), tx.witness_set(), txAuxData,
      ).to_hex();
    }

    return cborTx;
  }

  static readMetadata(cborTx: string) {
    const tx = deserializeTx(cborTx);
    return tx.auxiliary_data()?.metadata()?.to_hex() ?? '';
  }

  static writeMetadata(cborTx: string, cborTxMetadata: string) {
    const tx = deserializeTx(cborTx);
    const txAuxData = tx.auxiliary_data()
      ?? csl.AuxiliaryData.new();

    txAuxData.set_metadata(
      csl.GeneralTransactionMetadata.from_hex(cborTxMetadata),
    );

    return csl.Transaction.new(
      tx.body(), tx.witness_set(), txAuxData,
    ).to_hex();
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
  redeemValue(options: {
    value: UTxO | Mint,
    script: PlutusScript | UTxO,
    datum: Data | UTxO,
    redeemer?: Action,
  }): Transaction {
    if ('assetName' in options.value)
      throw new Error('Plutus Minting is not implemented yet...');

    const redeemer: Action = {
      tag: 'SPEND',
      budget: DEFAULT_REDEEMER_BUDGET,
      index: this._txInputsBuilder.inputs().len(),
      data: {
        alternative: 0,
        fields: [],
      },
      ...options.redeemer,
    };

    const utxo = toTxUnspentOutput(options.value);
    const witness = csl.PlutusWitness.new_with_ref(
      buildPlutusScriptSource(options.script),
      buildDatumSource(options.datum),
      toRedeemer(redeemer),
    );

    this._txInputsBuilder.add_plutus_script_input(
      witness, utxo.input(), utxo.output().amount(),
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

  setMetadata(key: number, value: unknown): Transaction {
    this._txBuilder.add_json_metadatum_with_schema(
      csl.BigNum.from_str(key.toString()), JSON.stringify(value),
      csl.MetadataJsonSchema.NoConversions,
    );

    return this;
  }

  @Checkpoint()
  setRequiredSigners(addresses: string[]): Transaction {
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

  setTimeToStart(slot: string): Transaction {
    this._txBuilder.set_validity_start_interval_bignum(
      csl.BigNum.from_str(slot),
    );

    return this;
  }

  setTimeToExpire(slot: string): Transaction {
    this._txBuilder.set_ttl_bignum(
      csl.BigNum.from_str(slot),
    );

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
      const utxos = await this._initiator.getUsedUTxOs();
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
      const address = await this._initiator.getUsedAddress();
      this._txBuilder.add_change_if_needed(address);
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
      const address = await this._initiator.getUsedAddress();
      const keyHash = resolvePaymentKeyHash(address.to_bech32());
      this._txBuilder.add_required_signer(deserializeEd25519KeyHash(keyHash));
    }
  }

  private async addTxInputsAsNeeded() {
    this._txBuilder.set_inputs(this._txInputsBuilder);

    if (this.notVisited('setTxInputs')) {
      const hasMultiAsset = !this.notVisited('mintAsset')
        || !this.notVisited('sendAssets')
        || !this.notVisited('sendValue');

      // insure change holds enough ADA to cover multiasset.
      const selectedUTxOs = await this.selectLovelaceUTxOs(false);
      const availableUTxOs = await this.filterAvailableUTxOs(selectedUTxOs);
      
      const coinSelectionStrategy = hasMultiAsset
        ? csl.CoinSelectionStrategyCIP2.LargestFirstMultiAsset
        : csl.CoinSelectionStrategyCIP2.LargestFirst;

      this._txBuilder.add_inputs_from(availableUTxOs, coinSelectionStrategy);
    }

    if (this.notVisited('redeemValue') === false) {
      const costModels = this._era !== undefined
        ? SUPPORTED_COST_MODELS[this._era]
        : SUPPORTED_COST_MODELS.BABBAGE;

      this._txBuilder.calc_script_data_hash(costModels);
    }
  }

  private async forgeAssetsIfNeeded() {
    type Mintdata = { unit: string, data: Mint };
    type Metadata = Record<string, Record<string, AssetMetadata>>;

    const forge = (mint: Mintdata, meta?: Metadata): Metadata => {
      const name = mint.data.assetName;
      const metadata = mint.data.metadata;
      const collection = mint.unit
        .slice(0, POLICY_ID_LENGTH);

      if (meta && meta[collection]) {
        const {
          [collection]: oldCollection, ...rest
        } = meta;

        const newCollection = {
          [name]: metadata,
          ...oldCollection,
        };

        return {
          [collection]: {
            ...newCollection,
          }, ...rest,
        };
      }

      if (meta !== undefined) {
        return {
          [collection]: {
            [name]: metadata,
          },
          ...meta,
        };
      }

      return {
        [collection]: { [name]: metadata },
      };
    };

    await this.addBurnInputsIfNeeded();

    Array
      .from(this._totalMints, (mint) => (<Mintdata>{
        unit: mint[0],
        data: mint[1],
      }))
      .reduce((metadatums, mint) => {
        return metadatums.set(mint.data.label, forge(
          mint, metadatums.get(mint.data.label),
        ));
      }, new Map<string, Metadata>)
      .forEach((metadata, label) => {
        this._txBuilder.add_json_metadatum(
          csl.BigNum.from_str(label),
          JSON.stringify(metadata),
        );
      });

    this.addMintOutputs();
  }

  private async filterAvailableUTxOs(selectedUTxOs: UTxO[] = []) {
    const txUnspentOutputs = csl.TransactionUnspentOutputs.new();

    if (this._initiator === undefined)
      return txUnspentOutputs;

    const allUTxOs = await this._initiator
      .getUsedUTxOs();

    allUTxOs
      .filter((au) => {
        return (
          selectedUTxOs.find(
            (su) => su.input.txHash === au.input().transaction_id().to_hex()
          ) === undefined
        );
      })
      .forEach((utxo) => {
        txUnspentOutputs.add(utxo);
      });

    return txUnspentOutputs;
  }

  private async selectLovelaceUTxOs(hasMultiAsset: boolean) {
    if (this._initiator === undefined || hasMultiAsset === false)
      return [];

    const utxos = await this._initiator.getUsedUTxOs();

    const selection = largestFirst('5000000',
      utxos.map((utxo) => fromTxUnspentOutput(utxo)),
    );

    const inputs = selection
      .map((utxo) => toTxUnspentOutput(utxo));

    inputs
      .forEach((utxo) => {
        this._txBuilder.add_input(
          utxo.output().address(),
          utxo.input(),
          utxo.output().amount(),
        );
      });

    return selection;
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
  initiator: IInitiator;
  parameters: Protocol;
  era: Era;
};
