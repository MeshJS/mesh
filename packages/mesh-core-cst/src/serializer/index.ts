import { Serialization, TxCBOR } from "@cardano-sdk/core";
import { HexBlob } from "@cardano-sdk/util";

import {
  BuilderData,
  NativeScript as CommonNativeScript,
  Data,
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DeserializedAddress,
  DeserializedScript,
  IDeserializer,
  IMeshTxSerializer,
  IResolver,
  MeshTxBuilderBody,
  MintItem,
  Output,
  PlutusScript,
  Protocol,
  PubKeyTxIn,
  RefTxIn,
  RequiredWith,
  ScriptSource,
  ScriptTxIn,
  SimpleScriptSourceInfo,
  SimpleScriptTxIn,
  TxIn,
  ValidityRange,
} from "@meshsdk/common";

import { StricaPrivateKey } from "../";
import {
  Address,
  AssetId,
  AssetName,
  CredentialType,
  Datum,
  DatumHash,
  Ed25519PublicKeyHex,
  Ed25519SignatureHex,
  ExUnits,
  NativeScript,
  PlutusData,
  PlutusLanguageVersion,
  PlutusV1Script,
  PlutusV2Script,
  PlutusV3Script,
  PolicyId,
  Redeemer,
  Redeemers,
  RedeemerTag,
  Script,
  Slot,
  TokenMap,
  Transaction,
  TransactionBody,
  TransactionId,
  TransactionInput,
  TransactionOutput,
  TransactionWitnessSet,
  Value,
  VkeyWitness,
} from "../types";
import { toAddress, toPlutusData, toValue } from "../utils";
import { hashScriptData } from "../utils/script-data-hash";
import { empty, mergeValue, negatives, subValue } from "../utils/value";

export class CardanoSDKSerializer implements IMeshTxSerializer {
  verbose: boolean;
  private txBody: TransactionBody;
  private txWitnessSet: TransactionWitnessSet;

  private utxoContext: Map<TransactionInput, TransactionOutput> = new Map<
    TransactionInput,
    TransactionOutput
  >();

  private redeemerContext: Map<TransactionInput, Redeemer> = new Map<
    TransactionInput,
    Redeemer
  >();

  private scriptsProvided: Set<Script> = new Set<Script>();
  private datumsProvided: Set<PlutusData> = new Set<PlutusData>();
  private usedLanguages: Record<PlutusLanguageVersion, boolean> = {
    [0]: false,
    [1]: false,
    [2]: false,
  };

  constructor(verbose = false) {
    this.verbose = verbose;
    this.txBody = new TransactionBody(
      Serialization.CborSet.fromCore([], TransactionInput.fromCore),
      [],
      BigInt(0),
      undefined,
    );
    this.txWitnessSet = new TransactionWitnessSet();
  }
  serializeRewardAddress(
    stakeKeyHash: string,
    isScriptHash?: boolean,
    network_id?: 0 | 1,
  ): string {
    throw new Error("Method not implemented.");
  }
  serializePoolId(hash: string): string {
    throw new Error("Method not implemented.");
  }

  serializeAddress(address: DeserializedAddress, networkId?: 0 | 1): string {
    throw new Error("Method not implemented.");
  }

  serializeData(data: BuilderData): string {
    throw new Error("Method not implemented.");
  }

  deserializer: IDeserializer = {
    key: {
      deserializeAddress: function (bech32: string): DeserializedAddress {
        throw new Error("Function not implemented.");

        // return {
        //   pubKeyHash: this.resolvePaymentKeyHash(address),
        //   scriptHash: this.resolvePlutusScriptHash(address),
        //   stakeCredentialHash: this.resolveStakeKeyHash(address),
        //   stakeScriptCredentialHash: this.resolveStakeScriptHash(address),
        // };
      },
    },
    script: {
      deserializeNativeScript: function (
        script: CommonNativeScript,
      ): DeserializedScript {
        throw new Error("Function not implemented.");
      },
      deserializePlutusScript: function (
        script: PlutusScript,
      ): DeserializedScript {
        throw new Error("Function not implemented.");
      },
    },
    cert: {
      deserializePoolId: function (poolId: string): string {
        throw new Error("Function not implemented.");
      },
    },
  };

  resolver: IResolver = {
    keys: {
      // resolvePaymentKeyHash: function (bech32: string): string {
      //   const cardanoAddress = toAddress(bech32);
      //   return cardanoAddress.asEnterprise()?.getPaymentCredential().type ===
      //     CredentialType.KeyHash
      //     ? cardanoAddress.asEnterprise()!.getPaymentCredential().hash
      //     : "";
      // },
      // resolvePlutusScriptHash: function (bech32: string): string {
      //   const cardanoAddress = toAddress(bech32);
      //   return cardanoAddress.asEnterprise()?.getPaymentCredential().type ===
      //     CredentialType.ScriptHash
      //     ? cardanoAddress.asEnterprise()!.getPaymentCredential().hash
      //     : "";
      // },
      resolveStakeKeyHash: function (bech32: string): string {
        const cardanoAddress = toAddress(bech32);
        return cardanoAddress.asReward()?.getPaymentCredential().type ===
          CredentialType.KeyHash
          ? cardanoAddress.asReward()!.getPaymentCredential().hash
          : "";
      },
      // resolveStakeScriptHash(bech32: string): string {
      //   const cardanoAddress = toAddress(bech32);
      //   return cardanoAddress.asReward()?.getPaymentCredential().type ===
      //     CredentialType.ScriptHash
      //     ? cardanoAddress.asReward()!.getPaymentCredential().hash
      //     : "";
      // },
      resolvePrivateKey: function (words: string[]): string {
        throw new Error("Function not implemented.");
      },
      resolveRewardAddress: function (bech32: string): string {
        throw new Error("Function not implemented.");
      },
      resolveEd25519KeyHash: function (bech32: string): string {
        throw new Error("Function not implemented.");
      },
    },
    tx: {
      resolveTxHash: function (txHex: string): string {
        return Transaction.fromCbor(TxCBOR(txHex)).getId();
      },
    },
    data: {
      resolveDataHash: function (data: Data): string {
        throw new Error("Function not implemented.");
      },
    },
    script: {
      // resolveNativeScript: function (script: CommonNativeScript): string {
      //   return toNativeScript(script).toCbor();
      // },
      resolveScriptRef: function (
        script: CommonNativeScript | PlutusScript,
      ): string {
        throw new Error("Function not implemented.");
      },
    },
  };

  serializeTxBody = (
    txBuilderBody: MeshTxBuilderBody,
    protocolParams: Protocol,
  ): string => {
    const {
      inputs,
      outputs,
      collaterals,
      referenceInputs,
      mints,
      changeAddress,
      // certificates,
      validityRange,
      requiredSignatures,
      // metadata,
    } = txBuilderBody;

    mints.sort((a, b) => a.policyId.localeCompare(b.policyId));
    inputs.sort((a, b) => {
      if (a.txIn.txHash === b.txIn.txHash) {
        return a.txIn.txIndex - b.txIn.txIndex;
      } else {
        return a.txIn.txHash.localeCompare(b.txIn.txHash);
      }
    });

    this.addAllInputs(inputs);
    this.addAllOutputs(outputs);
    this.addAllMints(mints);
    this.addAllCollateralInputs(collaterals);
    this.addAllReferenceInputs(referenceInputs);
    this.setValidityInterval(validityRange);
    this.buildWitnessSet();
    this.balanceTx(changeAddress, requiredSignatures.length, protocolParams);
    return new Transaction(this.txBody, this.txWitnessSet).toCbor();
  };

  addSigningKeys = (txHex: string, signingKeys: string[]): string => {
    let cardanoTx = Transaction.fromCbor(TxCBOR(txHex));
    let currentWitnessSet = cardanoTx.witnessSet();
    let currentWitnessSetVkeys = currentWitnessSet.vkeys();
    let currentWitnessSetVkeysValues: Serialization.VkeyWitness[] =
      currentWitnessSetVkeys ? [...currentWitnessSetVkeys.values()] : [];
    for (let i = 0; i < signingKeys.length; i++) {
      let keyHex = signingKeys[i];
      if (keyHex) {
        if (keyHex.length === 68 && keyHex.substring(0, 4) === "5820") {
          keyHex = keyHex.substring(4);
        }
        const cardanoSigner = StricaPrivateKey.fromSecretKey(
          Buffer.from(keyHex, "hex"),
        );
        const signature = cardanoSigner.sign(
          Buffer.from(cardanoTx.getId(), "hex"),
        );
        currentWitnessSetVkeysValues.push(
          new VkeyWitness(
            Ed25519PublicKeyHex(
              cardanoSigner.toPublicKey().toBytes().toString("hex"),
            ),
            Ed25519SignatureHex(signature.toString("hex")),
          ),
        );
      }
    }
    currentWitnessSet.setVkeys(
      Serialization.CborSet.fromCore(
        currentWitnessSetVkeysValues.map((vkw) => vkw.toCore()),
        VkeyWitness.fromCore,
      ),
    );
    cardanoTx.setWitnessSet(currentWitnessSet);
    return cardanoTx.toCbor();
  };

  private addAllInputs = (inputs: TxIn[]) => {
    for (let i = 0; i < inputs.length; i += 1) {
      const currentTxIn = inputs[i];
      if (!currentTxIn) continue;
      switch (currentTxIn.type) {
        case "PubKey":
          this.addTxIn(currentTxIn as RequiredWith<PubKeyTxIn, "txIn">);
          break;
        case "Script":
          this.addScriptTxIn(
            currentTxIn as RequiredWith<ScriptTxIn, "txIn" | "scriptTxIn">,
          );
          break;
        case "SimpleScript":
          this.addSimpleScriptTxIn(
            currentTxIn as RequiredWith<
              SimpleScriptTxIn,
              "txIn" | "simpleScriptTxIn"
            >,
          );
      }
    }
  };

  private addTxIn = (currentTxIn: RequiredWith<PubKeyTxIn, "txIn">) => {
    // First build Cardano tx in and add it to tx body
    let cardanoTxIn = new TransactionInput(
      TransactionId(currentTxIn.txIn.txHash),
      BigInt(currentTxIn.txIn.txIndex),
    );
    const inputs = this.txBody.inputs();
    const txInputsList: TransactionInput[] = [...inputs.values()];
    if (
      txInputsList.find((input) => {
        input.index() == cardanoTxIn.index() &&
          input.transactionId == cardanoTxIn.transactionId;
      })
    ) {
      throw new Error("Duplicate input added to tx body");
    }
    txInputsList.push(cardanoTxIn);
    inputs.setValues(txInputsList);
    // We save the output to a mapping so that we can calculate change
    const cardanoTxOut = new TransactionOutput(
      Address.fromBech32(currentTxIn.txIn.address),
      toValue(currentTxIn.txIn.amount),
    );
    this.utxoContext.set(cardanoTxIn, cardanoTxOut);
    this.txBody.setInputs(inputs);
  };

  private addScriptTxIn = (
    currentTxIn: RequiredWith<ScriptTxIn, "txIn" | "scriptTxIn">,
  ) => {
    // we can add the input in first, and handle the script info after
    this.addTxIn({
      type: "PubKey",
      txIn: currentTxIn.txIn,
    });
    if (!currentTxIn.scriptTxIn.scriptSource) {
      throw new Error("A script input had no script source");
    }
    if (!currentTxIn.scriptTxIn.datumSource) {
      throw new Error("A script input had no datum source");
    }
    if (!currentTxIn.scriptTxIn.redeemer) {
      throw new Error("A script input had no redeemer");
    }
    // Handle script info based on whether it's inlined or provided
    if (currentTxIn.scriptTxIn.scriptSource.type === "Provided") {
      switch (currentTxIn.scriptTxIn.scriptSource.script.version) {
        case "V1": {
          this.scriptsProvided.add(
            Script.newPlutusV1Script(
              PlutusV1Script.fromCbor(
                HexBlob(currentTxIn.scriptTxIn.scriptSource.script.code),
              ),
            ),
          );
          this.usedLanguages[PlutusLanguageVersion.V1] = true;
          break;
        }
        case "V2": {
          this.scriptsProvided.add(
            Script.newPlutusV2Script(
              PlutusV2Script.fromCbor(
                HexBlob(currentTxIn.scriptTxIn.scriptSource.script.code),
              ),
            ),
          );
          this.usedLanguages[PlutusLanguageVersion.V2] = true;
          break;
        }
        case "V3": {
          this.scriptsProvided.add(
            Script.newPlutusV3Script(
              PlutusV3Script.fromCbor(
                HexBlob(currentTxIn.scriptTxIn.scriptSource.script.code),
              ),
            ),
          );
          this.usedLanguages[PlutusLanguageVersion.V3] = true;
          break;
        }
      }
    } else if (currentTxIn.scriptTxIn.scriptSource.type === "Inline") {
      let referenceInputs =
        this.txBody.referenceInputs() ??
        Serialization.CborSet.fromCore([], TransactionInput.fromCore);

      let referenceInputsList = [...referenceInputs.values()];

      referenceInputsList.push(
        new TransactionInput(
          TransactionId(currentTxIn.scriptTxIn.scriptSource.txHash),
          BigInt(currentTxIn.scriptTxIn.scriptSource.txIndex),
        ),
      );

      referenceInputs.setValues(referenceInputsList);

      this.txBody.setReferenceInputs(referenceInputs);
      switch (currentTxIn.scriptTxIn.scriptSource.version) {
        case "V1": {
          this.usedLanguages[PlutusLanguageVersion.V1] = true;
          break;
        }
        case "V2": {
          this.usedLanguages[PlutusLanguageVersion.V2] = true;
          break;
        }
        case "V3": {
          this.usedLanguages[PlutusLanguageVersion.V3] = true;
          break;
        }
      }
    }
    if (currentTxIn.scriptTxIn.datumSource.type === "Provided") {
      this.datumsProvided.add(
        toPlutusData(currentTxIn.scriptTxIn.datumSource.data.content as Data), // TODO: handle json / raw datum
      );
    } else if (currentTxIn.scriptTxIn.datumSource.type === "Inline") {
      let referenceInputs =
        this.txBody.referenceInputs() ??
        Serialization.CborSet.fromCore([], TransactionInput.fromCore);

      let referenceInputsList = [...referenceInputs.values()];

      referenceInputsList.push(
        new TransactionInput(
          TransactionId(currentTxIn.txIn.txHash),
          BigInt(currentTxIn.txIn.txIndex),
        ),
      );

      referenceInputs.setValues(referenceInputsList);

      this.txBody.setReferenceInputs(referenceInputs);
    }
    let cardanoTxIn = new TransactionInput(
      TransactionId(currentTxIn.txIn.txHash),
      BigInt(currentTxIn.txIn.txIndex),
    );
    // Keep track of all redeemers mapped to their inputs
    // TODO: handle json / raw redeemer data
    let exUnits = currentTxIn.scriptTxIn.redeemer.exUnits;

    this.redeemerContext.set(
      cardanoTxIn,
      new Redeemer(
        RedeemerTag.Spend,
        BigInt(0),
        toPlutusData(currentTxIn.scriptTxIn.redeemer.data.content as Data), // TODO: handle json / raw datum
        new ExUnits(BigInt(exUnits.mem), BigInt(exUnits.steps)),
      ),
    );
  };

  private addSimpleScriptTxIn = (
    currentTxIn: RequiredWith<SimpleScriptTxIn, "txIn" | "simpleScriptTxIn">,
  ) => {
    // we can add the input in first, and handle the script info after
    this.addTxIn({
      type: "PubKey",
      txIn: currentTxIn.txIn,
    });
    if (!currentTxIn.simpleScriptTxIn.scriptSource) {
      throw new Error("A native script input had no script source");
    }
    if (currentTxIn.simpleScriptTxIn.scriptSource.type === "Provided") {
      this.scriptsProvided.add(
        Script.newNativeScript(
          NativeScript.fromCbor(
            HexBlob(currentTxIn.simpleScriptTxIn.scriptSource.scriptCode),
          ),
        ),
      );
    } else if (currentTxIn.simpleScriptTxIn.scriptSource.type === "Inline") {
      let referenceInputs =
        this.txBody.referenceInputs() ??
        Serialization.CborSet.fromCore([], TransactionInput.fromCore);

      let referenceInputsList = [...referenceInputs.values()];

      referenceInputsList.push(
        new TransactionInput(
          TransactionId(currentTxIn.simpleScriptTxIn.scriptSource.txHash),
          BigInt(currentTxIn.simpleScriptTxIn.scriptSource.txIndex),
        ),
      );

      referenceInputs.setValues(referenceInputsList);

      this.txBody.setReferenceInputs(referenceInputs);
    }
  };

  private addAllOutputs = (outputs: Output[]) => {
    for (let i = 0; i < outputs.length; i++) {
      this.addOutput(outputs[i]!);
    }
  };

  private addOutput = (output: Output) => {
    const currentOutputs = this.txBody.outputs();
    const cardanoOutput = new TransactionOutput(
      Address.fromBech32(output.address),
      toValue(output.amount),
    );
    if (output.datum?.type === "Hash") {
      cardanoOutput.setDatum(
        Datum.newDataHash(
          DatumHash.fromHexBlob(
            HexBlob(toPlutusData(output.datum.data.content as Data).hash()),
          ),
        ),
      );
    } else if (output.datum?.type === "Inline") {
      cardanoOutput.setDatum(
        Datum.newInlineData(
          toPlutusData(output.datum.data.content as Data), // TODO: handle json / raw datum
        ),
      );
    }
    if (output.referenceScript) {
      switch (output.referenceScript.version) {
        case "V1": {
          cardanoOutput.setScriptRef(
            Script.newPlutusV1Script(
              PlutusV1Script.fromCbor(HexBlob(output.referenceScript.code)),
            ),
          );
          break;
        }
        case "V2": {
          cardanoOutput.setScriptRef(
            Script.newPlutusV2Script(
              PlutusV2Script.fromCbor(HexBlob(output.referenceScript.code)),
            ),
          );
          break;
        }
        case "V3": {
          cardanoOutput.setScriptRef(
            Script.newPlutusV3Script(
              PlutusV3Script.fromCbor(HexBlob(output.referenceScript.code)),
            ),
          );
          break;
        }
      }
    }
    currentOutputs.push(cardanoOutput);
    this.txBody.setOutputs(currentOutputs);
  };

  private addAllReferenceInputs = (refInputs: RefTxIn[]) => {
    for (let i = 0; i < refInputs.length; i++) {
      this.addReferenceIput(refInputs[i]!);
    }
  };

  private addReferenceIput = (refInput: RefTxIn) => {
    let referenceInputs =
      this.txBody.referenceInputs() ??
      Serialization.CborSet.fromCore([], TransactionInput.fromCore);

    let referenceInputsList = [...referenceInputs.values()];

    referenceInputsList.push(
      new TransactionInput(
        TransactionId.fromHexBlob(HexBlob(refInput.txHash)),
        BigInt(refInput.txIndex),
      ),
    );
    referenceInputs.setValues(referenceInputsList);

    this.txBody.setReferenceInputs(referenceInputs);
  };

  private addAllMints = (mints: MintItem[]) => {
    for (let i = 0; i < mints.length; i++) {
      this.addMint(mints[i]!);
    }
  };

  private addMint = (mint: MintItem) => {
    const currentMint: TokenMap = this.txBody.mint() ?? new Map();

    const mintAssetId = mint.policyId + mint.assetName;

    for (const asset of currentMint.keys()) {
      if (asset.toString() == mintAssetId) {
        throw new Error("The same asset is already in the mint field");
      }
    }

    currentMint.set(
      AssetId.fromParts(PolicyId(mint.policyId), AssetName(mint.assetName)),
      BigInt(mint.amount),
    );
    this.txBody.setMint(currentMint);

    if (mint.type === "Native") {
      if (!mint.scriptSource)
        throw new Error("Script source not provided for native script mint");
      const nativeScriptSource: SimpleScriptSourceInfo =
        mint.scriptSource as SimpleScriptSourceInfo;
      if (!nativeScriptSource)
        throw new Error(
          "A script source for a native script was not a native script somehow",
        );
      if (nativeScriptSource.type === "Provided") {
        this.scriptsProvided.add(
          Script.newNativeScript(
            NativeScript.fromCbor(HexBlob(nativeScriptSource.scriptCode)),
          ),
        );
      } else if (nativeScriptSource.type === "Inline") {
        let referenceInputs =
          this.txBody.referenceInputs() ??
          Serialization.CborSet.fromCore([], TransactionInput.fromCore);

        let referenceInputsList = [...referenceInputs.values()];

        referenceInputsList.push(
          new TransactionInput(
            TransactionId(nativeScriptSource.txHash),
            BigInt(nativeScriptSource.txIndex),
          ),
        );

        referenceInputs.setValues(referenceInputsList);

        this.txBody.setReferenceInputs(referenceInputs);
      }
    } else if (mint.type === "Plutus") {
      if (!mint.scriptSource)
        throw new Error("Script source not provided for plutus script mint");
      const plutusScriptSource = mint.scriptSource as ScriptSource;
      if (!plutusScriptSource) {
        throw new Error(
          "A script source for a plutus mint was not plutus script somehow",
        );
      }
      if (plutusScriptSource.type === "Provided") {
        switch (plutusScriptSource.script.version) {
          case "V1":
            this.scriptsProvided.add(
              Script.newPlutusV1Script(
                PlutusV1Script.fromCbor(
                  HexBlob(plutusScriptSource.script.code),
                ),
              ),
            );
            break;
          case "V2":
            this.scriptsProvided.add(
              Script.newPlutusV2Script(
                PlutusV2Script.fromCbor(
                  HexBlob(plutusScriptSource.script.code),
                ),
              ),
            );
            break;
          case "V3":
            this.scriptsProvided.add(
              Script.newPlutusV3Script(
                PlutusV3Script.fromCbor(
                  HexBlob(plutusScriptSource.script.code),
                ),
              ),
            );
            break;
        }
      } else if (plutusScriptSource.type === "Inline") {
        let referenceInputs =
          this.txBody.referenceInputs() ??
          Serialization.CborSet.fromCore([], TransactionInput.fromCore);

        let referenceInputsList = [...referenceInputs.values()];

        referenceInputsList.push(
          new TransactionInput(
            TransactionId(plutusScriptSource.txHash),
            BigInt(plutusScriptSource.txIndex),
          ),
        );

        referenceInputs.setValues(referenceInputsList);

        this.txBody.setReferenceInputs(referenceInputs);
        switch (plutusScriptSource.version) {
          case "V1": {
            this.usedLanguages[PlutusLanguageVersion.V1] = true;
            break;
          }
          case "V2": {
            this.usedLanguages[PlutusLanguageVersion.V2] = true;
            break;
          }
          case "V3": {
            this.usedLanguages[PlutusLanguageVersion.V3] = true;
            break;
          }
        }
      }
    }
  };

  private addAllCollateralInputs = (collaterals: PubKeyTxIn[]) => {
    for (let i = 0; i < collaterals.length; i++) {
      this.addCollateralInput(
        collaterals[i] as RequiredWith<PubKeyTxIn, "txIn">,
      );
    }
  };

  private addCollateralInput = (
    collateral: RequiredWith<PubKeyTxIn, "txIn">,
  ) => {
    // First build Cardano tx in and add it to tx body
    let cardanoTxIn = new TransactionInput(
      TransactionId(collateral.txIn.txHash),
      BigInt(collateral.txIn.txIndex),
    );
    const collateralInputs =
      this.txBody.collateral() ??
      Serialization.CborSet.fromCore([], TransactionInput.fromCore);
    const collateralInputsList: TransactionInput[] = [
      ...collateralInputs.values(),
    ];
    if (
      collateralInputsList.find((input) => {
        input.index() == cardanoTxIn.index() &&
          input.transactionId == cardanoTxIn.transactionId;
      })
    ) {
      throw new Error("Duplicate input added to tx body");
    }
    collateralInputsList.push(cardanoTxIn);
    collateralInputs.setValues(collateralInputsList);
    // We save the output to a mapping so that we can calculate collateral return later
    // TODO: set collateral return
    const cardanoTxOut = new TransactionOutput(
      Address.fromBech32(collateral.txIn.address),
      toValue(collateral.txIn.amount),
    );
    this.utxoContext.set(cardanoTxIn, cardanoTxOut);
    this.txBody.setCollateral(collateralInputs);
  };

  private setValidityInterval = (validity: ValidityRange) => {
    if (validity.invalidBefore) {
      this.txBody.setValidityStartInterval(Slot(validity.invalidBefore));
    }
    if (validity.invalidHereafter) {
      this.txBody.setTtl(Slot(validity.invalidHereafter));
    }
  };

  private buildWitnessSet = () => {
    const inputs = this.txBody.inputs();
    // Search through the inputs, and set each redeemer index to the correct one
    for (let i = 0; i < inputs.size(); i += 1) {
      const input = inputs.values().at(i);
      if (input) {
        let redeemer = this.redeemerContext.get(input);
        if (redeemer) {
          redeemer.setIndex(BigInt(i));
        }
      }
    }
    // Add redeemers to tx witness set
    let redeemers = this.txWitnessSet.redeemers() ?? Redeemers.fromCore([]);
    let redeemersList = [...redeemers.values()];
    this.redeemerContext.forEach((redeemer) => {
      redeemersList.push(redeemer);
    });
    redeemers.setValues(redeemersList);
    this.txWitnessSet.setRedeemers(redeemers);

    // Add provided scripts to tx witness set
    let nativeScripts =
      this.txWitnessSet.nativeScripts() ??
      Serialization.CborSet.fromCore([], NativeScript.fromCore);

    let v1Scripts =
      this.txWitnessSet.plutusV1Scripts() ??
      Serialization.CborSet.fromCore([], PlutusV1Script.fromCore);

    let v2Scripts =
      this.txWitnessSet.plutusV2Scripts() ??
      Serialization.CborSet.fromCore([], PlutusV2Script.fromCore);

    let v3Scripts =
      this.txWitnessSet.plutusV3Scripts() ??
      Serialization.CborSet.fromCore([], PlutusV3Script.fromCore);

    this.scriptsProvided.forEach((script) => {
      if (script.asNative() !== undefined) {
        let nativeScriptsList = [...nativeScripts.values()];
        nativeScriptsList.push(script.asNative()!);
        nativeScripts.setValues(nativeScriptsList);
      } else if (script.asPlutusV1() !== undefined) {
        let v1ScriptsList = [...v1Scripts.values()];
        v1ScriptsList.push(script.asPlutusV1()!);
        v1Scripts.setValues(v1ScriptsList);
      } else if (script.asPlutusV2() !== undefined) {
        let v2ScriptsList = [...v2Scripts.values()];
        v2ScriptsList.push(script.asPlutusV2()!);
        v2Scripts.setValues(v2ScriptsList);
      } else if (script.asPlutusV3() !== undefined) {
        let v3ScriptsList = [...v3Scripts.values()];
        v3ScriptsList.push(script.asPlutusV3()!);
        v3Scripts.setValues(v3ScriptsList);
      }

      this.txWitnessSet.setNativeScripts(nativeScripts);
      this.txWitnessSet.setPlutusV1Scripts(v1Scripts);
      this.txWitnessSet.setPlutusV2Scripts(v2Scripts);
      this.txWitnessSet.setPlutusV3Scripts(v3Scripts);
    });

    // Add provided datums to tx witness set
    let datums =
      this.txWitnessSet.plutusData() ??
      Serialization.CborSet.fromCore([], PlutusData.fromCore);

    this.datumsProvided.forEach((datum) => {
      let datumsList = [...datums.values()];
      datumsList.push(datum);
      datums.setValues(datumsList);
    });
    this.txWitnessSet.setPlutusData(datums);

    // After building tx witness set, we must hash it with the cost models
    // and put the hash in the tx body
    let costModelV1 = Serialization.CostModel.newPlutusV1(
      DEFAULT_V1_COST_MODEL_LIST,
    );
    let costModelV2 = Serialization.CostModel.newPlutusV2(
      DEFAULT_V2_COST_MODEL_LIST,
    );
    let costModels = new Serialization.Costmdls();

    if (this.usedLanguages[PlutusLanguageVersion.V1]) {
      costModels.insert(costModelV1);
    }
    if (this.usedLanguages[PlutusLanguageVersion.V2]) {
      costModels.insert(costModelV2);
    }
    if (this.usedLanguages[PlutusLanguageVersion.V3]) {
      // TODO: insert v3 cost models after conway HF
    }
    let scriptDataHash = hashScriptData(
      costModels,
      redeemers.size() > 0 ? [...redeemers.values()] : undefined,
      datums.size() > 0 ? [...datums.values()] : undefined,
    );
    if (scriptDataHash) {
      this.txBody.setScriptDataHash(scriptDataHash);
    }
  };

  private balanceTx = (
    changeAddress: string,
    numberOfRequiredWitnesses: number,
    protocolParams: Protocol,
  ) => {
    if (changeAddress === "") {
      throw new Error("Can't balance tx without a change address");
    }

    // First we add up all input values
    const inputs = this.txBody.inputs().values();
    let remainingValue = new Value(BigInt(0));
    for (let i = 0; i < inputs.length; i++) {
      let input = inputs[i];
      if (!input) {
        throw new Error("Invalid input found");
      }
      const output = this.utxoContext.get(input);
      if (!output) {
        throw new Error(`Unable to resolve input: ${input.toCbor()}`);
      }
      remainingValue = mergeValue(remainingValue, output.amount());
    }

    // Then we add all withdrawal values
    const withdrawals = this.txBody.withdrawals();
    if (withdrawals) {
      withdrawals.forEach((coin) => {
        remainingValue = mergeValue(remainingValue, new Value(coin));
      });
    }

    // Then we add all mint values
    remainingValue = mergeValue(
      remainingValue,
      new Value(BigInt(0), this.txBody.mint()),
    );

    // We then take away any current outputs
    const currentOutputs = this.txBody.outputs();
    for (let i = 0; i < currentOutputs.length; i++) {
      let output = currentOutputs.at(i);
      if (output) {
        remainingValue = subValue(remainingValue, output.amount());
      }
    }

    // Add an initial change output, this is needed to generate dummy tx
    // If inputs - outputs is negative, then throw error
    if (remainingValue.coin() < 0 || !empty(negatives(remainingValue))) {
      throw new Error(`Not enough funds to satisfy outputs`);
    }

    currentOutputs.push(
      new TransactionOutput(Address.fromBech32(changeAddress), remainingValue),
    );
    this.txBody.setOutputs(currentOutputs);

    // Create a dummy tx that we will use to calculate fees
    this.txBody.setFee(BigInt("10000000"));
    const dummyTx = this.createDummyTx(numberOfRequiredWitnesses);
    const fee =
      protocolParams.minFeeB +
      (dummyTx.toCbor().length / 2) * Number(protocolParams.coinsPerUtxoSize);
    this.txBody.setFee(BigInt(fee));

    // The change output should be the last element in outputs
    // so we can simply take away the calculated fees from it
    const changeOutput = currentOutputs.pop();
    if (!changeOutput) {
      throw new Error(
        "Somehow the output length was 0 after attempting to calculate fees",
      );
    }
    changeOutput.amount().setCoin(changeOutput.amount().coin() - BigInt(fee));
    currentOutputs.push(changeOutput);
    this.txBody.setOutputs(currentOutputs);
  };

  private createDummyTx = (numberOfRequiredWitnesses: number): Transaction => {
    let dummyWitnessSet = new TransactionWitnessSet();
    const dummyVkeyWitnesses: [Ed25519PublicKeyHex, Ed25519SignatureHex][] = [];
    for (let i = 0; i < numberOfRequiredWitnesses; i++) {
      dummyVkeyWitnesses.push([
        Ed25519PublicKeyHex("0".repeat(64)),
        Ed25519SignatureHex("0".repeat(128)),
      ]);
    }
    dummyWitnessSet.setVkeys(
      Serialization.CborSet.fromCore(dummyVkeyWitnesses, VkeyWitness.fromCore),
    );

    return new Transaction(this.txBody, dummyWitnessSet);
  };
}
