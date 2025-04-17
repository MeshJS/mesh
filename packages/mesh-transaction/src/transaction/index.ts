import {
  Action,
  Asset,
  Budget,
  CIP68_100,
  CIP68_222,
  Data,
  DEFAULT_REDEEMER_BUDGET,
  hexToString,
  IInitiator,
  metadataToCip68,
  Metadatum,
  Mint,
  NativeScript,
  Network,
  PlutusScript,
  POLICY_ID_LENGTH,
  PoolParams,
  Recipient,
  stringToHex,
  SUPPORTED_TOKENS,
  Token,
  UTxO,
} from "@meshsdk/common";
import {
  Cardano,
  CardanoSDKUtil,
  deserializeNativeScript,
  deserializePlutusScript,
  deserializeTx,
  fromScriptRef,
  Serialization,
  Transaction as Tx,
} from "@meshsdk/core-cst";

import { MeshTxBuilder, MeshTxBuilderOptions } from "../mesh-tx-builder";
import { mergeContents, metadataObjToMap } from "../utils";

export interface TransactionOptions extends MeshTxBuilderOptions {
  initiator: IInitiator;
}

/**
 * Deprecated - Use `MeshTxBuilder` instead
 */
export class Transaction {
  txBuilder: MeshTxBuilder;
  initiator: IInitiator;
  isCollateralNeeded: boolean = false;

  constructor(options: TransactionOptions) {
    this.txBuilder = new MeshTxBuilder(options);
    this.initiator = options.initiator;
  }

  static attachMetadata(cborTx: string, cborTxMetadata: string) {
    const tx = deserializeTx(cborTx);
    const txAuxData = tx.auxiliaryData() ?? new Serialization.AuxiliaryData();

    txAuxData.setMetadata(
      Serialization.GeneralTransactionMetadata.fromCbor(
        CardanoSDKUtil.HexBlob(cborTxMetadata),
      ),
    );

    if (
      Cardano.computeAuxiliaryDataHash(txAuxData.toCore())?.toString() !==
      tx.body().auxiliaryDataHash()?.toString()
    ) {
      throw new Error(
        "[Transaction] attachMetadata: The metadata hash does not match the auxiliary data hash.",
      );
    }

    return new Tx(tx.body(), tx.witnessSet(), txAuxData).toCbor().toString();
  }

  static deattachMetadata(cborTx: string) {
    const tx = deserializeTx(cborTx);
    return new Tx(tx.body(), tx.witnessSet()).toCbor().toString();
  }

  static maskMetadata(cborTx: string) {
    const tx = deserializeTx(cborTx);
    const txMetadata = tx.auxiliaryData()?.metadata();

    if (txMetadata !== undefined) {
      const mockMetadata = new Map<
        bigint,
        Serialization.TransactionMetadatum
      >();
      txMetadata
        .metadata()
        ?.forEach((metadatum, label) =>
          mockMetadata.set(label, mask(metadatum)),
        );
      const txAuxData = tx.auxiliaryData();
      txMetadata.setMetadata(mockMetadata);
      txAuxData?.setMetadata(txMetadata);
      return new Tx(tx.body(), tx.witnessSet(), txAuxData).toCbor().toString();
    }

    return cborTx;
  }

  static readMetadata(cborTx: string) {
    const tx = deserializeTx(cborTx);
    return tx.auxiliaryData()?.metadata()?.toCbor().toString() ?? "";
  }

  static writeMetadata(cborTx: string, cborTxMetadata: string) {
    const tx = deserializeTx(cborTx);
    const txAuxData = tx.auxiliaryData() ?? new Serialization.AuxiliaryData();

    txAuxData.setMetadata(
      Serialization.GeneralTransactionMetadata.fromCbor(
        CardanoSDKUtil.HexBlob(cborTxMetadata),
      ),
    );

    return new Tx(tx.body(), tx.witnessSet(), txAuxData).toCbor().toString();
  }

  /**
   * [Deprecated] - `Transaction` class is on planning for V2.
   * Use `MeshTxBuilder` instead for tx-building for now.
   *
   * @param recipient The recipient of the output.
   * @param assets The assets to send. Provide string for lovelace and Asset[] for tokens and/or lovelace.
   * @returns The transaction builder.
   * @see {@link https://meshjs.dev/apis/transaction#sendAssets}
   */
  sendAssets(recipient: Recipient, assets: Asset[] | string): Transaction {
    if (typeof assets === "string") {
      assets = [
        {
          unit: "lovelace",
          quantity: assets,
        },
      ];
    }
    if (typeof recipient === "string") {
      this.txBuilder.txOut(recipient, assets);
    }
    if (typeof recipient === "object") {
      this.txBuilder.txOut(recipient.address, assets);
      if (recipient.datum) {
        if (recipient.datum.inline) {
          this.txBuilder.txOutInlineDatumValue(recipient.datum.value);
        } else {
          this.txBuilder.txOutDatumHashValue(recipient.datum.value);
        }
      }
    }

    return this;
  }

  /**
   * [Deprecated] - `Transaction` class is on planning for V2.
   * Use `MeshTxBuilder` instead for tx-building for now.
   *
   * Use sendAssets instead:
   * ```ts
   * this.sendAssets(recipient, lovelace);
   * ```
   *
   * Deprecation reason - Unnecessary implementation which might cause confusion.
   *
   * @param {Recipient} recipient The recipient of the transaction.
   * @param {string} lovelace The amount of lovelace to send.
   * @returns {Transaction} The Transaction object.
   * @see {@link https://meshjs.dev/apis/transaction#sendAda}
   */
  sendLovelace(recipient: Recipient, lovelace: string): Transaction {
    return this.sendAssets(recipient, lovelace);
  }

  /**
   * [Deprecated] - `Transaction` class is on planning for V2.
   * Use `MeshTxBuilder` instead for tx-building for now.
   *
   * Please use sendAssets with helper function to obtain token unit instead:
   * ```ts
   * const assets = [{ unit: SUPPORTED_TOKENS.GIMBAL, quantity: "100" }]
   * transaction.sendAssets(recipient, assets)
   * ```
   *
   * Deprecation reason - Required maintenance on tokens.
   *
   * @param {Recipient} recipient The recipient of the transaction.
   * @param {Token} ticker The ticker of the token to send.
   * @param {string} amount The amount of the token to send.
   * @returns {Transaction} The Transaction object.
   * @see {@link https://meshjs.dev/apis/transaction#sendToken}
   */
  sendToken(recipient: Recipient, ticker: Token, amount: string): Transaction {
    const assets = [{ unit: SUPPORTED_TOKENS[ticker], quantity: amount }];
    return this.sendAssets(recipient, assets);
  }

  /**
   * [Deprecated] - `Transaction` class is on planning for V2.
   * Use `MeshTxBuilder` instead for tx-building for now.
   *
   * ```ts
   * const assets = value.output.amount;
   * this.sendAssets(recipient, assets);
   * ```
   * Deprecation reason - Unnecessary implementation which might cause confusion.
   *
   * @param {Recipient} recipient The recipient of the output.
   * @param {UTxO} value The UTxO value of the output.
   * @returns {Transaction} The Transaction object.
   */
  sendValue(recipient: Recipient, value: UTxO): Transaction {
    const assets = value.output.amount;
    return this.sendAssets(recipient, assets);
  }

  /**
   * [Deprecated] - `Transaction` class is on planning for V2.
   * Use `MeshTxBuilder` instead for tx-building for now.
   *
   * @param {UTxO[]} inputs The inputs to set.
   * @returns {Transaction} The transaction.
   */
  setTxInputs(inputs: UTxO[]): Transaction {
    inputs.forEach((input) => {
      this.txBuilder.txIn(
        input.input.txHash,
        input.input.outputIndex,
        input.output.amount,
        input.output.address,
        input.output.scriptRef ? input.output.scriptRef.length / 2 : 0,
      );
    });

    return this;
  }

  /**
   * [Deprecated] - `Transaction` class is on planning for V2.
   * Use `MeshTxBuilder` instead for tx-building for now.
   *
   * @param {UTxO[]} inputs The reference inputs to set.
   * @returns {Transaction} The transaction.
   */
  setTxRefInputs(inputs: UTxO[]): Transaction {
    inputs.forEach((input) => {
      this.txBuilder.readOnlyTxInReference(
        input.input.txHash,
        input.input.outputIndex,
      );
    });

    return this;
  }

  /**
   * [Deprecated] - `Transaction` class is on planning for V2.
   * Use `MeshTxBuilder` instead for tx-building for now.
   *
   * Sets the native script for the transaction.
   * @param {NativeScript} script The native script to spend from.
   * @param {UTxO} utxo The UTxO attached to the script.
   * @returns {Transaction} The Transaction object.
   */
  setNativeScriptInput(script: NativeScript, utxo: UTxO): Transaction {
    const { scriptCbor } =
      this.txBuilder.serializer.deserializer.script.deserializeNativeScript(
        script,
      );
    this.txBuilder
      .txIn(
        utxo.input.txHash,
        utxo.input.outputIndex,
        utxo.output.amount,
        utxo.output.address,
      )
      .txInScript(scriptCbor!);

    return this;
  }

  /**
   * [Deprecated] - `Transaction` class is on planning for V2.
   * Use `MeshTxBuilder` instead for tx-building for now.
   */
  // TODO: nuke this probably as the input type is too confusing
  redeemValue(options: {
    value: UTxO;
    script: PlutusScript | UTxO;
    redeemer?: Pick<Action, "data"> & { budget?: Budget };
    datum?: Data | UTxO;
  }): Transaction {
    const { value, script, datum, redeemer } = options;
    const red = redeemer || {
      data: { alternative: 0, fields: ["mesh"] },
      budget: DEFAULT_REDEEMER_BUDGET,
    };

    if ("code" in script) {
      // Provided script for redemption
      this.isCollateralNeeded = true;
      this.spendingPlutusScript(script)
        .txIn(
          value.input.txHash,
          value.input.outputIndex,
          value.output.amount,
          value.output.address,
          value.output.scriptRef ? value.output.scriptRef.length / 2 : 0,
        )
        .txInScript(script.code)
        .txInRedeemerValue(red.data, "Mesh", red.budget);
    }

    if ("output" in script) {
      // Reference script for redemption
      if (!script.output.scriptRef) {
        throw new Error("redeemValue: No script reference found in UTxO");
      }
      const scriptRef = fromScriptRef(script.output.scriptRef);
      if (!scriptRef || !("code" in scriptRef)) {
        throw new Error("redeemValue: Script reference not found");
      }

      this.isCollateralNeeded = true;
      this.spendingPlutusScript(scriptRef)
        .txIn(
          value.input.txHash,
          value.input.outputIndex,
          value.output.amount,
          value.output.address,
        )
        .spendingTxInReference(
          script.input.txHash,
          script.input.outputIndex,
          (script.output.scriptRef.length / 2).toString(),
          script.output.scriptHash,
        )
        .txInRedeemerValue(red.data, "Mesh", red.budget);
    }

    if (datum) {
      // Provided datum for redemption
      this.txBuilder.txInDatumValue(datum);
    } else {
      // Reference datum for redemption
      this.txBuilder.txInInlineDatumPresent();
    }
    // if (typeof datum === "object" && "output" in datum) {
    //   // Reference datum for redemption
    // } else {
    //   // Provided datum for redemption
    //   if (datum) {
    //   }
    // }

    return this;
  }

  /**
   * [Deprecated] - `Transaction` class is on planning for V2.
   * Use `MeshTxBuilder` instead for tx-building for now.
   */
  mintAsset(
    forgeScript: string | PlutusScript | UTxO,
    mint: Mint,
    redeemer?: Pick<Action, "data"> & { budget?: Budget },
  ): Transaction {
    const assetQuantity = mint.assetQuantity;
    let assetNameHex = stringToHex(mint.assetName);
    const referenceAssetNameHex = CIP68_100(assetNameHex);
    if (mint.cip68ScriptAddress) {
      assetNameHex = CIP68_222(assetNameHex);
    }
    let policyId = "";
    switch (typeof forgeScript) {
      case "string":
        policyId = deserializeNativeScript(forgeScript).hash().toString();
        this.txBuilder
          .mint(assetQuantity, policyId, assetNameHex)
          .mintingScript(forgeScript);
        if (mint.cip68ScriptAddress) {
          this.txBuilder
            .mint(assetQuantity, policyId, referenceAssetNameHex)
            .mintingScript(forgeScript);
        }

        break;

      case "object":
        if (!redeemer)
          throw new Error(
            "burnAsset: Redeemer data is required for Plutus minting",
          );
        if ("code" in forgeScript) {
          // Burn plutus script assets with provided script
          policyId = deserializePlutusScript(
            forgeScript.code,
            forgeScript.version,
          )
            .hash()
            .toString();

          this.isCollateralNeeded = true;
          this.mintPlutusScript(forgeScript)
            .mint(assetQuantity, policyId, assetNameHex)
            .mintingScript(forgeScript.code)
            .mintRedeemerValue(redeemer.data, "Mesh", redeemer.budget);
          if (mint.cip68ScriptAddress) {
            this.mintPlutusScript(forgeScript)
              .mint(assetQuantity, policyId, referenceAssetNameHex)
              .mintingScript(forgeScript.code)
              .mintRedeemerValue(redeemer.data, "Mesh", redeemer.budget);
          }
          break;
        }
        if ("output" in forgeScript) {
          // Burn plutus script assets with reference script
          if (!forgeScript.output.scriptRef) {
            throw new Error("mintAsset: No script reference found in UTxO");
          }
          const script = fromScriptRef(forgeScript.output.scriptRef);
          if (!script) {
            throw new Error("mintAsset: Script reference not found");
          }

          if ("code" in script) {
            policyId = deserializePlutusScript(script.code, script.version)
              .hash()
              .toString();

            this.isCollateralNeeded = true;
            this.mintPlutusScript(script)
              .mint(assetQuantity, policyId, assetNameHex)
              .mintTxInReference(
                forgeScript.input.txHash,
                forgeScript.input.outputIndex,
                (forgeScript.output.scriptRef.length / 2).toString(),
                forgeScript.output.scriptHash,
              )
              .mintRedeemerValue(redeemer.data, "Mesh", redeemer.budget);
            if (mint.cip68ScriptAddress) {
              this.mintPlutusScript(script)
                .mint(assetQuantity, policyId, referenceAssetNameHex)
                .mintTxInReference(
                  forgeScript.input.txHash,
                  forgeScript.input.outputIndex,
                  (forgeScript.output.scriptRef.length / 2).toString(),
                  forgeScript.output.scriptHash,
                )
                .mintRedeemerValue(redeemer.data, "Mesh", redeemer.budget);
              break;
            }

            break;
          } else {
            // TODO: to implement reference script minting for native script tokens
            throw new Error(
              "mintAsset: Reference script minting not implemented",
            );
            // this.txBuilder
            //   .mint(assetQuantity, policyId, assetName)
            //   .mintTxInReference(
            //     forgeScript.input.txHash,
            //     forgeScript.input.outputIndex
            //   );
          }
        }
        break;
    }

    if (mint.recipient) {
      this.sendAssets(mint.recipient, [
        { unit: policyId + assetNameHex, quantity: mint.assetQuantity },
      ]);
    }
    if (mint.cip68ScriptAddress) {
      this.sendAssets(
        {
          address: mint.cip68ScriptAddress,
          datum: { inline: true, value: metadataToCip68(mint.metadata) },
        },
        [
          {
            unit: policyId + referenceAssetNameHex,
            quantity: mint.assetQuantity,
          },
        ],
      );
    }
    if (!mint.cip68ScriptAddress && mint.metadata && mint.label) {
      if (mint.label === "721" || mint.label === "20") {
        let currentMetadata = this.txBuilder.meshTxBuilderBody.metadata;
        if (currentMetadata.get(BigInt(mint.label)) === undefined) {
          this.setMetadata(Number(mint.label), {
            [policyId]: { [mint.assetName]: mint.metadata },
          });
        } else {
          let metadataMap = metadataObjToMap({
            [policyId]: { [mint.assetName]: mint.metadata },
          } as object);
          let newMetadata = mergeContents(
            currentMetadata.get(BigInt(mint.label)) as Metadatum,
            metadataMap,
            mint.label === "721" ? 2 : 0,
          );
          this.setMetadata(Number(mint.label), newMetadata);
        }
      } else {
        this.setMetadata(Number(mint.label), mint.metadata);
      }
    }

    return this;
  }

  /**
   * [Deprecated] - `Transaction` class is on planning for V2.
   * Use `MeshTxBuilder` instead for tx-building for now.
   */
  burnAsset(
    forgeScript: string | PlutusScript | UTxO,
    asset: Asset,
    redeemer?: Pick<Action, "data"> & { budget?: Budget },
  ): Transaction {
    const assetQuantity = "-" + asset.quantity;
    const mint: Mint = {
      assetName: hexToString(asset.unit.slice(POLICY_ID_LENGTH)),
      assetQuantity: assetQuantity,
    };
    try {
      this.mintAsset(forgeScript, mint, redeemer);
    } catch (error) {
      throw new Error("burnAsset: " + error);
    }

    return this;
  }

  /**
   * [Deprecated] - `Transaction` class is on planning for V2.
   * Use `MeshTxBuilder` instead for tx-building for now.
   *
   * Sets the change address for the transaction.
   *
   * @param {string} changeAddress The change address.
   * @returns {Transaction} The Transaction object.
   */
  setChangeAddress(changeAddress: string): Transaction {
    this.txBuilder.changeAddress(changeAddress);
    return this;
  }

  /**
   * [Deprecated] - `Transaction` class is on planning for V2.
   * Use `MeshTxBuilder` instead for tx-building for now.
   *
   * Sets the collateral for the transaction.
   *
   * @param {UTxO[]} collateral - Set the UTxO for collateral.
   * @returns {Transaction} The Transaction object.
   */
  setCollateral(collateral: UTxO[]): Transaction {
    collateral.forEach((collateralUtxo) => {
      this.txBuilder.txInCollateral(
        collateralUtxo.input.txHash,
        collateralUtxo.input.outputIndex,
        collateralUtxo.output.amount,
        collateralUtxo.output.address,
      );
    });

    return this;
  }

  /**
   * [Deprecated] - `Transaction` class is on planning for V2.
   * Use `MeshTxBuilder` instead for tx-building for now.
   *
   * Sets the network to use, this is mainly to know the cost models to be used to calculate script integrity hash
   * @param network The specific network this transaction is being built for ("testnet" | "preview" | "preprod" | "mainnet")
   * @returns The Transaction object.
   */
  setNetwork = (network: Network) => {
    this.txBuilder.setNetwork(network);
    return this;
  };

  /**
   * [Deprecated] - `Transaction` class is on planning for V2.
   * Use `MeshTxBuilder` instead for tx-building for now.
   *
   * Sets the required signers for the transaction.
   *
   * @param {string[]} addresses The addresses of the required signers.
   * @returns {Transaction} The Transaction object.
   */
  setRequiredSigners(addresses: string[]): Transaction {
    addresses.forEach((address) => {
      const { pubKeyHash } =
        this.txBuilder.serializer.deserializer.key.deserializeAddress(address);
      this.txBuilder.requiredSignerHash(pubKeyHash);
    });

    return this;
  }

  /**
   * [Deprecated] - `Transaction` class is on planning for V2.
   * Use `MeshTxBuilder` instead for tx-building for now.
   *
   *  Set the time to live for the transaction.
   *
   * @param {string} slot The slot number to expire the transaction at.
   * @returns {Transaction} The Transaction object.
   * @see {@link https://meshjs.dev/apis/transaction#setTimeLimit}
   */
  setTimeToExpire(slot: string): Transaction {
    this.txBuilder.invalidHereafter(Number(slot));
    return this;
  }

  /**
   * [Deprecated] - `Transaction` class is on planning for V2.
   * Use `MeshTxBuilder` instead for tx-building for now.
   *
   *  Sets the start slot for the transaction.
   *
   * @param {string} slot The start slot for the transaction.
   * @returns {Transaction} The Transaction object.
   * @see {@link https://meshjs.dev/apis/transaction#setTimeLimit}
   */
  setTimeToStart(slot: string): Transaction {
    this.txBuilder.invalidBefore(Number(slot));
    return this;
  }

  /**
   * [Deprecated] - `Transaction` class is on planning for V2.
   * Use `MeshTxBuilder` instead for tx-building for now.
   *
   *  Add a JSON metadata entry to the transaction.
   *
   * @param {number} label The label to use for the metadata entry.
   * @param {unknown} metadata The value to use for the metadata entry.
   * @returns {Transaction} The Transaction object.
   * @see {@link https://meshjs.dev/apis/transaction#setMetadata}
   */
  setMetadata(label: number, metadata: Metadatum | object): Transaction {
    this.txBuilder.metadataValue(label, metadata);
    return this;
  }

  /**
   * [Deprecated] - `Transaction` class is on planning for V2.
   * Use `MeshTxBuilder` instead for tx-building for now.
   */
  withdrawRewards(rewardAddress: string, lovelace: string): Transaction {
    this.txBuilder.withdrawal(rewardAddress, lovelace);
    return this;
  }

  /**
   * [Deprecated] - `Transaction` class is on planning for V2.
   * Use `MeshTxBuilder` instead for tx-building for now.
   */
  delegateStake(rewardAddress: string, poolId: string): Transaction {
    this.txBuilder.delegateStakeCertificate(
      rewardAddress,
      this.txBuilder.serializer.deserializer.cert.deserializePoolId(poolId),
    );
    return this;
  }

  /**
   * [Deprecated] - `Transaction` class is on planning for V2.
   * Use `MeshTxBuilder` instead for tx-building for now.
   */
  deregisterStake(rewardAddress: string): Transaction {
    this.txBuilder.deregisterStakeCertificate(rewardAddress);
    return this;
  }

  /**
   * [Deprecated] - `Transaction` class is on planning for V2.
   * Use `MeshTxBuilder` instead for tx-building for now.
   */
  registerStake(rewardAddress: string): Transaction {
    this.txBuilder.registerStakeCertificate(rewardAddress);
    return this;
  }

  /**
   * [Deprecated] - `Transaction` class is on planning for V2.
   * Use `MeshTxBuilder` instead for tx-building for now.
   */
  registerPool(params: PoolParams): Transaction {
    this.txBuilder.registerPoolCertificate(params);
    return this;
  }

  /**
   * [Deprecated] - `Transaction` class is on planning for V2.
   * Use `MeshTxBuilder` instead for tx-building for now.
   */
  retirePool(poolId: string, epochNo: number): Transaction {
    this.txBuilder.retirePoolCertificate(poolId, epochNo);
    return this;
  }

  async build(balanced: Boolean = true): Promise<string> {
    try {
      await this.addCollateralIfNeeded();
      await this.addTxInputsAsNeeded();
      await this.addChangeAddress();
      if (balanced) {
        return this.txBuilder.complete();
      } else {
        return this.txBuilder.completeUnbalanced();
      }
    } catch (error) {
      throw new Error(
        `[Transaction] An error occurred during build: ${error}.`,
      );
    }
  }

  protected mintPlutusScript(script: PlutusScript) {
    switch (script.version) {
      case "V1":
        this.txBuilder.mintPlutusScriptV1();
        break;
      case "V2":
        this.txBuilder.mintPlutusScriptV2();
        break;
      case "V3":
        this.txBuilder.mintPlutusScriptV3();
        break;
    }
    return this.txBuilder;
  }

  protected spendingPlutusScript(script: PlutusScript) {
    switch (script.version) {
      case "V1":
        this.txBuilder.spendingPlutusScriptV1();
        break;
      case "V2":
        this.txBuilder.spendingPlutusScriptV2();
        break;
      case "V3":
        this.txBuilder.spendingPlutusScriptV3();
        break;
    }
    return this.txBuilder;
  }

  private async addCollateralIfNeeded() {
    if (this.isCollateralNeeded) {
      const collaterals = await this.initiator.getCollateral();
      if (collaterals.length > 0) {
        this.setCollateral(collaterals);
        return;
      }
      const utxos = await this.initiator.getUtxos();
      const pureLovelaceUtxos = utxos.filter(
        (utxo) => utxo.output.amount.length === 1,
      );

      pureLovelaceUtxos.sort((a, b) => {
        return (
          Number(a.output.amount[0]?.quantity!) -
          Number(a.output.amount[0]?.quantity!)
        );
      });

      for (const utxo of pureLovelaceUtxos) {
        if (Number(utxo.output.amount[0]?.quantity!) >= 5000000) {
          return [utxo];
        }
      }

      if (pureLovelaceUtxos.length === 0) {
        throw new Error("No pure lovelace utxos found for collateral");
      }
      this.setCollateral([pureLovelaceUtxos[0]!]);
    }
  }

  private async addTxInputsAsNeeded() {
    if (this.txBuilder.meshTxBuilderBody.extraInputs.length === 0) {
      const utxos = await this.initiator.getUtxos();
      this.txBuilder.selectUtxosFrom(utxos);
    }
  }

  private async addChangeAddress() {
    if (this.txBuilder.meshTxBuilderBody.changeAddress === "") {
      const changeAddress = await this.initiator.getChangeAddress();
      this.setChangeAddress(changeAddress);
    }
  }
}

function mask(
  metadatum: Serialization.TransactionMetadatum,
): Serialization.TransactionMetadatum {
  switch (metadatum.getKind()) {
    case Serialization.TransactionMetadatumKind.Text:
      return Serialization.TransactionMetadatum.newText(
        "0".repeat(metadatum.asText()?.length ?? 0),
      );
    case Serialization.TransactionMetadatumKind.Bytes:
    case Serialization.TransactionMetadatumKind.Integer:
      return metadatum;
    case Serialization.TransactionMetadatumKind.List:
      const list = new Serialization.MetadatumList();
      for (let i = 0; i < (metadatum.asList()?.getLength() ?? 0); i++) {
        list.add(mask(metadatum.asList()?.get(i)!));
      }
      return Serialization.TransactionMetadatum.newList(list);
    case Serialization.TransactionMetadatumKind.Map:
      const map = new Serialization.MetadatumMap();
      for (let i = 0; i < (metadatum.asMap()?.getLength() ?? 0); i++) {
        const key = metadatum.asMap()?.getKeys().get(i)!;
        const value = metadatum.asMap()?.get(key)!;
        map.insert(key, mask(value));
      }
      return Serialization.TransactionMetadatum.newMap(map);
    default:
      throw new Error(`Unsupported metadatum kind: ${metadatum.getKind()}`);
  }
}
