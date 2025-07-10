/*
This file is part of meshjs.dev.

This source code is licensed under the MIT license found in the
LICENSE file in the root directory of this source tree. See the
Apache-2.0 License for more details.
*/

import { Buffer } from "buffer";
import { Serialization, setInConwayEra } from "@cardano-sdk/core";
import { HexBlob } from "@cardano-sdk/util";
import {
  Cbor,
  CborArray,
  CborBytes,
  CborString,
  CborTag,
  CborUInt,
} from "@harmoniclabs/cbor";
import base32 from "base32-encoding";
import { bech32 } from "bech32";

import {
  Asset,
  BasicVote,
  BuilderData,
  Certificate,
  NativeScript as CommonNativeScript,
  DEFAULT_PROTOCOL_PARAMETERS,
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
  DeserializedAddress,
  DeserializedScript,
  fromUTF8,
  IDeserializer,
  IMeshTxSerializer,
  IResolver,
  ITxParser,
  MeshTxBuilderBody,
  MintParam,
  mnemonicToEntropy,
  Output,
  PlutusDataType,
  PlutusScript,
  Protocol,
  PubKeyTxIn,
  RefTxIn,
  RequiredWith,
  ScriptSource,
  ScriptTxIn,
  ScriptVote,
  SimpleScriptSourceInfo,
  SimpleScriptTxIn,
  SimpleScriptVote,
  toBytes,
  TxIn,
  TxInput,
  TxMetadata,
  UTxO,
  ValidityRange,
  Vote,
  Withdrawal,
} from "@meshsdk/common";

import { resolveDataHash } from "..";
import {
  Address,
  AddressType,
  AssetId,
  AssetName,
  AuxiliaryData,
  AuxilliaryData,
  Bip32PrivateKey,
  BootstrapWitness,
  ByronAttributes,
  CborSet,
  CborWriter,
  computeAuxiliaryDataHash,
  CredentialCore,
  CredentialType,
  Datum,
  DatumHash,
  Ed25519KeyHashHex,
  Ed25519PublicKeyHex,
  Ed25519SignatureHex,
  ExUnits,
  Hash28ByteBase16,
  NativeScript,
  PlutusData,
  PlutusLanguageVersion,
  PlutusV1Script,
  PlutusV2Script,
  PlutusV3Script,
  PolicyId,
  PoolId,
  Redeemer,
  Redeemers,
  RedeemerTag,
  RewardAccount,
  RewardAddress,
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
import {
  buildEd25519PrivateKeyFromSecretKey,
  fromBuilderToPlutusData,
  mergeValue,
  toAddress,
  toCardanoAddress,
  toNativeScript,
  toValue,
} from "../utils";
import { toCardanoCert } from "../utils/certificate";
import { toCardanoMetadataMap } from "../utils/metadata";
import { hashScriptData } from "../utils/script-data-hash";
import {
  toCardanoGovernanceActionId,
  toCardanoVoter,
  toCardanoVotingProcedure,
} from "../utils/vote";

const VKEY_PUBKEY_SIZE_BYTES = 32;
const VKEY_SIGNATURE_SIZE_BYTES = 64;
const CHAIN_CODE_SIZE_BYTES = 32;

export class CardanoSDKSerializer implements IMeshTxSerializer {
  protocolParams: Protocol;

  constructor(protocolParams?: Protocol) {
    setInConwayEra(true);
    this.protocolParams = protocolParams || DEFAULT_PROTOCOL_PARAMETERS;
  }
  serializeRewardAddress(
    stakeKeyHash: string,
    isScriptHash?: boolean,
    network_id?: 0 | 1,
  ): string {
    return RewardAddress.fromCredentials(network_id ?? 0, {
      type: isScriptHash ? CredentialType.ScriptHash : CredentialType.KeyHash,
      hash: Hash28ByteBase16(stakeKeyHash),
    })
      .toAddress()
      .toBech32();
  }

  serializePoolId(hash: string): string {
    return PoolId.fromKeyHash(Ed25519KeyHashHex(hash)).toString();
  }

  serializeAddress(
    address: Partial<DeserializedAddress>,
    networkId?: 0 | 1,
  ): string {
    let paymentCred: CredentialCore | undefined = undefined;

    let stakeCred: CredentialCore | undefined;

    if (address.pubKeyHash && address.pubKeyHash !== "") {
      paymentCred = {
        type: CredentialType.KeyHash,
        hash: Hash28ByteBase16(address.pubKeyHash),
      };
    } else if (address.scriptHash && address.scriptHash !== "") {
      paymentCred = {
        type: CredentialType.ScriptHash,
        hash: Hash28ByteBase16(address.scriptHash),
      };
    }

    if (address.stakeCredentialHash && address.stakeCredentialHash !== "") {
      stakeCred = {
        type: CredentialType.KeyHash,
        hash: Hash28ByteBase16(address.stakeCredentialHash),
      };
    } else if (address.stakeScriptCredentialHash) {
      stakeCred = {
        type: CredentialType.ScriptHash,
        hash: Hash28ByteBase16(address.stakeScriptCredentialHash),
      };
    }

    let type: AddressType = AddressType.BasePaymentKeyStakeKey;
    if (paymentCred && stakeCred) {
      if (
        paymentCred.type === CredentialType.KeyHash &&
        stakeCred.type === CredentialType.KeyHash
      ) {
        type = AddressType.BasePaymentKeyStakeKey;
      } else if (
        paymentCred.type === CredentialType.KeyHash &&
        stakeCred.type === CredentialType.ScriptHash
      ) {
        type = AddressType.BasePaymentKeyStakeScript;
      } else if (
        paymentCred.type === CredentialType.ScriptHash &&
        stakeCred.type === CredentialType.KeyHash
      ) {
        type = AddressType.BasePaymentScriptStakeKey;
      } else if (
        paymentCred.type === CredentialType.ScriptHash &&
        stakeCred.type === CredentialType.ScriptHash
      ) {
        type = AddressType.BasePaymentScriptStakeScript;
      }
    } else if (paymentCred) {
      if (paymentCred.type === CredentialType.KeyHash) {
        type = AddressType.EnterpriseKey;
      } else if (paymentCred.type === CredentialType.ScriptHash) {
        type = AddressType.EnterpriseScript;
      }
    } else if (stakeCred) {
      if (stakeCred.type === CredentialType.KeyHash) {
        type = AddressType.RewardKey;
      } else if (stakeCred.type === CredentialType.ScriptHash) {
        type = AddressType.RewardScript;
      }
    }

    return new Address({
      type,
      networkId: networkId ?? 0,
      paymentPart: paymentCred,
      delegationPart: stakeCred,
    }).toBech32();
  }

  serializeData(data: BuilderData): string {
    const plutusData = fromBuilderToPlutusData(data);
    return plutusData.toCbor().toString();
  }

  deserializer: IDeserializer = {
    key: {
      deserializeAddress: function (bech32: string): DeserializedAddress {
        const address = Address.fromBech32(bech32);
        const addressProps = address.getProps();

        return {
          pubKeyHash:
            addressProps.paymentPart?.type === CredentialType.KeyHash
              ? (addressProps.paymentPart?.hash ?? "")
              : "",
          scriptHash:
            addressProps.paymentPart?.type === CredentialType.ScriptHash
              ? (addressProps.paymentPart?.hash ?? "")
              : "",
          stakeCredentialHash:
            addressProps.delegationPart?.type === CredentialType.KeyHash
              ? (addressProps.paymentPart?.hash ?? "")
              : "",
          stakeScriptCredentialHash:
            addressProps.delegationPart?.type === CredentialType.ScriptHash
              ? (addressProps.paymentPart?.hash ?? "")
              : "",
        };
      },
    },
    script: {
      deserializeNativeScript: function (
        script: CommonNativeScript,
      ): DeserializedScript {
        const cardanoNativeScript = toNativeScript(script);
        return {
          scriptHash: cardanoNativeScript.hash().toString(),
          scriptCbor: cardanoNativeScript.toCbor().toString(),
        };
      },
      deserializePlutusScript: function (
        script: PlutusScript,
      ): DeserializedScript {
        let cardanoPlutusScript:
          | PlutusV1Script
          | PlutusV2Script
          | PlutusV3Script;
        switch (script.version) {
          case "V1": {
            cardanoPlutusScript = new PlutusV1Script(HexBlob(script.code));
            break;
          }
          case "V2": {
            cardanoPlutusScript = new PlutusV2Script(HexBlob(script.code));
            break;
          }
          case "V3": {
            cardanoPlutusScript = new PlutusV3Script(HexBlob(script.code));
            break;
          }
        }
        return {
          scriptHash: cardanoPlutusScript.hash().toString(),
          scriptCbor: cardanoPlutusScript.toCbor().toString(),
        };
      },
    },
    cert: {
      deserializePoolId: function (poolId: string): string {
        const cardanoPoolId: PoolId = PoolId(poolId);
        return PoolId.toKeyHash(cardanoPoolId).toString();
      },
    },
  };

  resolver: IResolver = {
    keys: {
      resolveStakeKeyHash: function (bech32: string): string {
        const cardanoAddress = toAddress(bech32);
        return cardanoAddress.asReward()?.getPaymentCredential().type ===
          CredentialType.KeyHash
          ? cardanoAddress.asReward()!.getPaymentCredential().hash
          : "";
      },
      resolvePrivateKey: function (words: string[]): string {
        const buildBip32PrivateKey = (
          entropy: string,
          password = "",
        ): Bip32PrivateKey => {
          return Bip32PrivateKey.fromBip39Entropy(
            Buffer.from(toBytes(entropy)),
            fromUTF8(password),
          );
        };

        const entropy = mnemonicToEntropy(words.join(" "));
        const bip32PrivateKey = buildBip32PrivateKey(entropy);
        const bytes = base32.encode(bip32PrivateKey.bytes());
        const bech32PrivateKey = bech32.encode("xprv", bytes, 1023);

        return bech32PrivateKey;
      },
      resolveRewardAddress: function (bech32: string): string {
        const cardanoAddress = toAddress(bech32);
        const addressProps = cardanoAddress.getProps();
        if (!addressProps.delegationPart) {
          return "";
        }
        return (
          RewardAddress.fromCredentials(
            cardanoAddress.getNetworkId(),
            addressProps.delegationPart,
          )
            .toAddress()
            .toBech32() ?? ""
        );
      },
      resolveEd25519KeyHash: function (bech32: string): string {
        const cardanoAddress = toAddress(bech32);
        const addressProps = cardanoAddress.getProps();
        if (!addressProps.paymentPart) {
          return "";
        }
        return addressProps.paymentPart.hash.toString();
      },
    },
    tx: {
      resolveTxHash: function (txHex: string): string {
        return Transaction.fromCbor(Serialization.TxCBOR(txHex)).getId();
      },
    },
    data: {
      resolveDataHash: function (
        rawData: BuilderData["content"],
        type: PlutusDataType = "Mesh",
      ): string {
        return resolveDataHash(rawData, type);
      },
    },
    script: {
      resolveScriptRef: function (
        script: CommonNativeScript | PlutusScript,
      ): string {
        if ("code" in script) {
          let versionByte;
          switch (script.version) {
            case "V1": {
              versionByte = 1;
              break;
            }
            case "V2": {
              versionByte = 2;
              break;
            }
            case "V3": {
              versionByte = 3;
              break;
            }
          }
          let taggedScript: CborTag = new CborTag(
            24,
            Cbor.parse(
              CborString.fromCborObj(
                new CborBytes(
                  Cbor.encode(
                    new CborArray([
                      new CborUInt(versionByte),
                      new CborString(script.code).toCborObj(),
                    ]),
                  ).toBuffer(),
                ),
              ),
            ),
          );
          return Cbor.encode(taggedScript).toString();
        } else {
          const nativeScript = toNativeScript(script);
          let taggedScript: CborTag = new CborTag(
            24,
            Cbor.parse(
              CborString.fromCborObj(
                new CborBytes(
                  Cbor.encode(
                    new CborArray([
                      new CborUInt(0),
                      new CborString(nativeScript.toCbor()).toCborObj(),
                    ]),
                  ).toBuffer(),
                ),
              ),
            ),
          );
          return Cbor.encode(taggedScript).toString();
        }
      },
    },
  };

  serializeTxBody = (
    txBuilderBody: MeshTxBuilderBody,
    protocolParams?: Protocol,
  ): string => {
    const serializerCore = new CardanoSDKSerializerCore(
      protocolParams ?? this.protocolParams,
    );

    return serializerCore.coreSerializeTx(txBuilderBody);
  };

  serializeTxBodyWithMockSignatures(
    txBuilderBody: MeshTxBuilderBody,
    protocolParams: Protocol,
  ): string {
    const serializerCore = new CardanoSDKSerializerCore(protocolParams);
    return serializerCore.coreSerializeTxWithMockSignatures(txBuilderBody);
  }

  addSigningKeys = (txHex: string, signingKeys: string[]): string => {
    let cardanoTx = Transaction.fromCbor(Serialization.TxCBOR(txHex));
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
        const cardanoSigner = buildEd25519PrivateKeyFromSecretKey(keyHex);
        const signature = cardanoSigner.sign(HexBlob(cardanoTx.getId()));
        currentWitnessSetVkeysValues.push(
          new VkeyWitness(
            Ed25519PublicKeyHex(cardanoSigner.toPublic().hex()),
            Ed25519SignatureHex(signature.hex()),
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

  serializeValue(value: Asset[]): string {
    return toValue(value).toCbor();
  }

  serializeOutput(output: Output): string {
    let cardanoOutput = new TransactionOutput(
      toCardanoAddress(output.address),
      toValue(output.amount),
    );
    if (output.datum?.type === "Hash") {
      cardanoOutput.setDatum(
        Datum.newDataHash(fromBuilderToPlutusData(output.datum.data).hash()),
      );
    } else if (output.datum?.type === "Inline") {
      cardanoOutput.setDatum(
        Datum.newInlineData(fromBuilderToPlutusData(output.datum.data)),
      );
    } else if (output.datum?.type === "Embedded") {
      throw new Error("Embedded datum not supported");
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
        default: {
          cardanoOutput.setScriptRef(
            Script.newNativeScript(
              NativeScript.fromCbor(HexBlob(output.referenceScript.code)),
            ),
          );
          break;
        }
      }
    }
    return cardanoOutput.toCbor();
  }

  parser: ITxParser = {
    getRequiredInputs: function (txHex: string): TxInput[] {
      throw new Error("Function not implemented.");
    },
    parse: function (txHex: string, resolvedUtxos?: UTxO[]): void {
      throw new Error("Method not implemented.");
    },
    toTester: function (): any {
      throw new Error("Method not implemented.");
    },
    getBuilderBody: function (): MeshTxBuilderBody {
      throw new Error("Method not implemented.");
    },
    getBuilderBodyWithoutChange: function (): MeshTxBuilderBody {
      throw new Error("Method not implemented.");
    },
  };
}

class CardanoSDKSerializerCore {
  public txBody: TransactionBody;
  public txWitnessSet: TransactionWitnessSet;
  public txAuxilliaryData: AuxiliaryData;

  private utxoContext: Map<TransactionInput, TransactionOutput> = new Map<
    TransactionInput,
    TransactionOutput
  >();

  private mintRedeemers: Map<String, Redeemer> = new Map<String, Redeemer>();

  private scriptsProvided: Set<string> = new Set<string>();
  private datumsProvided: Set<PlutusData> = new Set<PlutusData>();
  private usedLanguages: Record<PlutusLanguageVersion, boolean> = {
    [0]: false,
    [1]: false,
    [2]: false,
  };
  private protocolParams: Protocol;
  private refScriptSize: number;

  constructor(protocolParams?: Protocol) {
    this.protocolParams = protocolParams || DEFAULT_PROTOCOL_PARAMETERS;
    this.txBody = new TransactionBody(
      Serialization.CborSet.fromCore([], TransactionInput.fromCore),
      [],
      BigInt(0),
      undefined,
    );
    this.refScriptSize = 0;
    this.txWitnessSet = new TransactionWitnessSet();
    this.txAuxilliaryData = new AuxilliaryData();
  }

  coreSerializeTxBody = (txBuilderBody: MeshTxBuilderBody): TransactionBody => {
    const {
      inputs,
      outputs,
      collaterals,
      requiredSignatures,
      referenceInputs,
      mints,
      metadata,
      validityRange,
      certificates,
      withdrawals,
      votes,
      totalCollateral,
      collateralReturnAddress,
      changeAddress,
    } = txBuilderBody;

    const uniqueRefInputs = this.removeBodyInputRefInputOverlap(
      inputs,
      referenceInputs,
    );
    try {
      this.addAllInputs(inputs);
    } catch (e) {
      throwErrorWithOrigin("Error serializing inputs", e);
    }
    try {
      this.setFee(txBuilderBody.fee ?? "0");
    } catch (e) {
      throwErrorWithOrigin("Error serializing fee", e);
    }
    try {
      this.sanitizeOutputs(outputs);
    } catch (e) {
      throwErrorWithOrigin("Error calculating min utxo values for outputs", e);
    }
    try {
      this.addAllOutputs(outputs);
    } catch (e) {
      throwErrorWithOrigin("Error serializing outputs", e);
    }
    try {
      this.addAllMints(mints);
    } catch (e) {
      throwErrorWithOrigin("Error serializing mints", e);
    }
    try {
      this.addAllCerts(certificates);
    } catch (e) {
      throwErrorWithOrigin("Error serializing certificates", e);
    }
    try {
      this.addAllWithdrawals(withdrawals);
    } catch (e) {
      throwErrorWithOrigin("Error serializing withdrawals", e);
    }
    try {
      this.addAllVotes(votes);
    } catch (e) {
      throwErrorWithOrigin("Error serializing votes", e);
    }
    try {
      this.addAllCollateralInputs(collaterals);
    } catch (e) {
      throwErrorWithOrigin("Error serializing collateral inputs", e);
    }
    if (totalCollateral) {
      try {
        this.txBody.setTotalCollateral(BigInt(totalCollateral));
        this.addCollateralReturn(
          totalCollateral,
          collaterals,
          collateralReturnAddress ?? changeAddress,
        );
      } catch (e) {
        throwErrorWithOrigin(
          "Error serializing total collateral and collateral return",
          e,
        );
      }
    }
    try {
      this.addAllReferenceInputs(uniqueRefInputs);
    } catch (e) {
      throwErrorWithOrigin("Error serializing reference inputs", e);
    }
    this.removeInputRefInputOverlap();
    try {
      this.setValidityInterval(validityRange);
    } catch (e) {
      throwErrorWithOrigin("Error serializing validity interval", e);
    }
    try {
      this.addAllRequiredSignatures(requiredSignatures);
    } catch (e) {
      throwErrorWithOrigin("Error serializing required signatures", e);
    }
    if (metadata.size > 0) {
      try {
        this.addMetadata(metadata);
      } catch (e) {
        throwErrorWithOrigin("Error serializing metadata", e);
      }
    }

    return this.txBody;
  };

  coreSerializeTx(txBuilderBody: MeshTxBuilderBody): string {
    const bodyCore = this.coreSerializeTxBody(txBuilderBody);
    if (txBuilderBody.fee !== undefined) {
      this.txBody.setFee(BigInt(txBuilderBody.fee));
    }
    this.buildWitnessSet();
    return new Transaction(
      bodyCore,
      this.txWitnessSet,
      this.txAuxilliaryData,
    ).toCbor();
  }

  coreSerializeTxWithMockSignatures(txBuilderBody: MeshTxBuilderBody): string {
    const bodyCore = this.coreSerializeTxBody(txBuilderBody);
    const mockWitSet = this.createMockedWitnessSet(
      txBuilderBody.expectedNumberKeyWitnesses,
      txBuilderBody.expectedByronAddressWitnesses,
    );
    return new Transaction(
      bodyCore,
      mockWitSet,
      this.txAuxilliaryData,
    ).toCbor();
  }

  private sanitizeOutputs = (outputs: Output[]): void => {
    for (let i = 0; i < outputs.length; i++) {
      let currentOutput = outputs[i];
      let lovelaceFound = false;
      for (let j = 0; j < currentOutput!.amount.length; j++) {
        let outputAmount = currentOutput!.amount[j];
        if (outputAmount?.unit == "" || outputAmount?.unit == "lovelace") {
          lovelaceFound = true;
          if (outputAmount?.quantity == "0" || outputAmount?.quantity == "") {
            // If lovelace quantity is not set, we will first set a dummy amount to calculate
            // the size of output, which we can then use to calculate the real minAdaAmount
            outputAmount.unit = "lovelace";
            outputAmount.quantity = "10000000";

            let dummyCardanoOutput: TransactionOutput = this.toCardanoOutput(
              currentOutput!,
            );
            let minUtxoValue =
              (160 + dummyCardanoOutput.toCbor().length / 2 + 1) *
              this.protocolParams.coinsPerUtxoSize;
            outputAmount.quantity = minUtxoValue.toString();
          }
        }
      }
      if (!lovelaceFound) {
        let currentAmount = {
          unit: "lovelace",
          quantity: "10000000",
        };
        currentOutput!.amount.push(currentAmount);
        let dummyCardanoOutput: TransactionOutput = this.toCardanoOutput(
          currentOutput!,
        );
        let minUtxoValue =
          (160 + dummyCardanoOutput.toCbor().length / 2 + 1) *
          this.protocolParams.coinsPerUtxoSize;
        currentAmount.quantity = minUtxoValue.toString();
        if (!lovelaceFound) {
          let currentAmount = {
            unit: "lovelace",
            quantity: "10000000",
          };
          currentOutput!.amount.push(currentAmount);
          let dummyCardanoOutput: TransactionOutput = this.toCardanoOutput(
            currentOutput!,
          );
          let minUtxoValue =
            (160 + dummyCardanoOutput.toCbor().length / 2 + 1) *
            this.protocolParams.coinsPerUtxoSize;
          currentAmount.quantity = minUtxoValue.toString();
        }
      }
    }
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
            i,
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
      toCardanoAddress(currentTxIn.txIn.address),
      toValue(currentTxIn.txIn.amount),
    );
    this.utxoContext.set(cardanoTxIn, cardanoTxOut);
    this.txBody.setInputs(inputs);

    // Add script size if ref script in input
    if (currentTxIn.txIn.scriptSize) {
      this.refScriptSize += currentTxIn.txIn.scriptSize;
    }
  };

  private addScriptTxIn = (
    currentTxIn: RequiredWith<ScriptTxIn, "txIn" | "scriptTxIn">,
    index: number,
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
      this.addProvidedPlutusScript(currentTxIn.scriptTxIn.scriptSource.script);
    } else if (currentTxIn.scriptTxIn.scriptSource.type === "Inline") {
      this.addScriptRef(currentTxIn.scriptTxIn.scriptSource);
    }
    if (currentTxIn.scriptTxIn.datumSource.type === "Provided") {
      this.datumsProvided.add(
        fromBuilderToPlutusData(currentTxIn.scriptTxIn.datumSource.data),
      );
    } else if (currentTxIn.scriptTxIn.datumSource.type === "Inline") {
      this.addReferenceInput({
        txHash: currentTxIn.txIn.txHash,
        txIndex: currentTxIn.txIn.txIndex,
      });
    }
    let exUnits = currentTxIn.scriptTxIn.redeemer.exUnits;

    // Add redeemers to witness set
    let redeemers = this.txWitnessSet.redeemers() ?? Redeemers.fromCore([]);
    let redeemersList = [...redeemers.values()];
    redeemersList.push(
      new Redeemer(
        RedeemerTag.Spend,
        BigInt(index),
        fromBuilderToPlutusData(currentTxIn.scriptTxIn.redeemer.data),
        new ExUnits(BigInt(exUnits.mem), BigInt(exUnits.steps)),
      ),
    );
    redeemers.setValues(redeemersList);
    this.txWitnessSet.setRedeemers(redeemers);
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
        ).toCbor(),
      );
    } else if (currentTxIn.simpleScriptTxIn.scriptSource.type === "Inline") {
      this.addSimpleScriptRef(currentTxIn.simpleScriptTxIn.scriptSource);
    }
  };

  private addAllOutputs = (outputs: Output[]) => {
    for (let i = 0; i < outputs.length; i++) {
      this.addOutput(outputs[i]!);
    }
  };

  private addOutput = (output: Output) => {
    const currentOutputs = this.txBody.outputs();
    currentOutputs.push(this.toCardanoOutput(output));
    this.txBody.setOutputs(currentOutputs);
  };

  private toCardanoOutput = (output: Output): TransactionOutput => {
    let cardanoOutput = new TransactionOutput(
      toCardanoAddress(output.address),
      toValue(output.amount),
    );
    if (output.datum?.type === "Hash") {
      cardanoOutput.setDatum(
        Datum.newDataHash(
          DatumHash(fromBuilderToPlutusData(output.datum.data).hash()),
        ),
      );
    } else if (output.datum?.type === "Inline") {
      cardanoOutput.setDatum(
        Datum.newInlineData(fromBuilderToPlutusData(output.datum.data)),
      );
    } else if (output.datum?.type === "Embedded") {
      // Embedded datums get added to witness set
      const currentWitnessDatum =
        this.txWitnessSet.plutusData() ??
        Serialization.CborSet.fromCore([], Serialization.PlutusData.fromCore);
      const currentWitnessDatumValues = [...currentWitnessDatum.values()];
      currentWitnessDatumValues.push(
        fromBuilderToPlutusData(output.datum.data),
      );
      currentWitnessDatum.setValues(currentWitnessDatumValues);
      this.txWitnessSet.setPlutusData(currentWitnessDatum);
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
    return cardanoOutput;
  };

  private addAllReferenceInputs = (refInputs: RefTxIn[]) => {
    for (let i = 0; i < refInputs.length; i++) {
      this.addReferenceInput(refInputs[i]!);
    }
  };

  private addReferenceInput = (refInput: RefTxIn) => {
    let referenceInputs =
      this.txBody.referenceInputs() ??
      Serialization.CborSet.fromCore([], TransactionInput.fromCore);

    let referenceInputsList = [...referenceInputs.values()];

    if (
      referenceInputsList.some(
        (input) =>
          input.transactionId().toString() === refInput.txHash &&
          input.index().toString() === refInput.txIndex.toString(),
      )
    )
      return;

    referenceInputsList.push(
      new TransactionInput(
        TransactionId(refInput.txHash),
        BigInt(refInput.txIndex),
      ),
    );
    referenceInputs.setValues(referenceInputsList);

    if (refInput.scriptSize) {
      this.refScriptSize += refInput.scriptSize;
    }

    this.txBody.setReferenceInputs(referenceInputs);
  };

  private addAllMints = (mints: MintParam[]) => {
    for (let i = 0; i < mints.length; i++) {
      this.addMint(mints[i]!);
    }
    let redeemers = this.txWitnessSet.redeemers() ?? Redeemers.fromCore([]);
    let redeemersList = [...redeemers.values()];
    let i = 0;
    this.mintRedeemers.forEach((redeemer) => {
      const newRedeemer = new Redeemer(
        redeemer.tag(),
        BigInt(i),
        redeemer.data(),
        redeemer.exUnits(),
      );
      redeemersList.push(newRedeemer);
      redeemers.setValues(redeemersList);
      i++;
    });
    this.txWitnessSet.setRedeemers(redeemers);
  };

  private addMint = (mint: MintParam) => {
    const currentMint: TokenMap = this.txBody.mint() ?? new Map();

    for (const assetValue of mint.mintValue) {
      const mintAssetId = `${mint.policyId}${assetValue.assetName}`;

      for (const asset of currentMint.keys()) {
        if (asset.toString() == mintAssetId) {
          throw new Error("The same asset is already in the mint field");
        }
      }

      currentMint.set(
        AssetId.fromParts(
          PolicyId(mint.policyId),
          AssetName(assetValue.assetName),
        ),
        BigInt(assetValue.amount),
      );
    }
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
          ).toCbor(),
        );
      } else if (nativeScriptSource.type === "Inline") {
        this.addSimpleScriptRef(nativeScriptSource);
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
      if (!mint.redeemer) {
        throw new Error("A redeemer was not provided for a plutus mint");
      }
      // Add mint redeemer to mapping
      const currentRedeemer = new Redeemer(
        RedeemerTag.Mint,
        BigInt(0),
        fromBuilderToPlutusData(mint.redeemer.data),
        new ExUnits(
          BigInt(mint.redeemer.exUnits.mem),
          BigInt(mint.redeemer.exUnits.steps),
        ),
      );
      if (this.mintRedeemers.has(mint.policyId)) {
        if (
          this.mintRedeemers.get(mint.policyId)?.toCbor() !==
          currentRedeemer.toCbor()
        ) {
          throw new Error(
            "The same minting policy must have the same redeemer",
          );
        }
      } else {
        this.mintRedeemers.set(mint.policyId, currentRedeemer);
      }

      if (plutusScriptSource.type === "Provided") {
        this.addProvidedPlutusScript(plutusScriptSource.script);
      } else if (plutusScriptSource.type === "Inline") {
        this.addScriptRef(plutusScriptSource);
      }
    }
  };

  private addAllCerts = (certs: Certificate[]) => {
    for (let i = 0; i < certs.length; i++) {
      this.addCert(certs[i]!, i);
    }
  };

  private addCert = (cert: Certificate, index: number) => {
    const currentCerts =
      this.txBody.certs() ??
      Serialization.CborSet.fromCore([], Serialization.Certificate.fromCore);
    let currentCertsValues = [...currentCerts.values()];
    currentCertsValues.push(toCardanoCert(cert.certType));
    currentCerts.setValues(currentCertsValues);
    this.txBody.setCerts(currentCerts);

    if (cert.type === "SimpleScriptCertificate") {
      if (!cert.simpleScriptSource)
        throw new Error("Script source not provided for native script cert");
      const nativeScriptSource: SimpleScriptSourceInfo =
        cert.simpleScriptSource as SimpleScriptSourceInfo;
      if (!nativeScriptSource)
        throw new Error(
          "A script source for a native script was not a native script somehow",
        );
      if (nativeScriptSource.type === "Provided") {
        this.scriptsProvided.add(
          Script.newNativeScript(
            NativeScript.fromCbor(HexBlob(nativeScriptSource.scriptCode)),
          ).toCbor(),
        );
      } else if (nativeScriptSource.type === "Inline") {
        this.addSimpleScriptRef(nativeScriptSource);
      }
    } else if (cert.type === "ScriptCertificate") {
      if (!cert.scriptSource)
        throw new Error(
          "Script source not provided for plutus script certificate",
        );
      const plutusScriptSource = cert.scriptSource as ScriptSource;
      if (!plutusScriptSource) {
        throw new Error(
          "A script source for a plutus certificate was not plutus script somehow",
        );
      }
      if (!cert.redeemer) {
        throw new Error("A redeemer was not provided for a plutus certificate");
      }

      // Add cert redeemer to witness set
      let redeemers = this.txWitnessSet.redeemers() ?? Redeemers.fromCore([]);
      let redeemersList = [...redeemers.values()];
      redeemersList.push(
        new Redeemer(
          RedeemerTag.Cert,
          BigInt(index),
          fromBuilderToPlutusData(cert.redeemer.data),
          new ExUnits(
            BigInt(cert.redeemer.exUnits.mem),
            BigInt(cert.redeemer.exUnits.steps),
          ),
        ),
      );
      redeemers.setValues(redeemersList);
      this.txWitnessSet.setRedeemers(redeemers);

      if (plutusScriptSource.type === "Provided") {
        this.addProvidedPlutusScript(plutusScriptSource.script);
      } else if (plutusScriptSource.type === "Inline") {
        this.addScriptRef(plutusScriptSource);
      }
    }
  };

  private addAllWithdrawals = (withdrawals: Withdrawal[]) => {
    for (let i = 0; i < withdrawals.length; i++) {
      this.addWithdrawal(withdrawals[i]!, i);
    }
  };

  private addWithdrawal = (withdrawal: Withdrawal, index: number) => {
    const currentWithdrawals =
      this.txBody.withdrawals() ?? new Map<RewardAccount, bigint>();
    const address = toCardanoAddress(withdrawal.address);
    const rewardAddress = address.asReward();
    if (!rewardAddress) {
      throw new Error("Failed to parse reward address for withdrawal");
    }
    currentWithdrawals.set(
      RewardAccount.fromCredential(
        rewardAddress.getPaymentCredential(),
        address.getNetworkId(),
      ),
      BigInt(withdrawal.coin),
    );
    this.txBody.setWithdrawals(currentWithdrawals);

    if (withdrawal.type === "SimpleScriptWithdrawal") {
      if (!withdrawal.scriptSource)
        throw new Error("Script source not provided for native script cert");
      const nativeScriptSource: SimpleScriptSourceInfo =
        withdrawal.scriptSource as SimpleScriptSourceInfo;
      if (!nativeScriptSource)
        throw new Error(
          "A script source for a native script was not a native script somehow",
        );
      if (nativeScriptSource.type === "Provided") {
        this.scriptsProvided.add(
          Script.newNativeScript(
            NativeScript.fromCbor(HexBlob(nativeScriptSource.scriptCode)),
          ).toCbor(),
        );
      } else if (nativeScriptSource.type === "Inline") {
        this.addSimpleScriptRef(nativeScriptSource);
      }
    } else if (withdrawal.type === "ScriptWithdrawal") {
      if (!withdrawal.scriptSource)
        throw new Error(
          "Script source not provided for plutus script certificate",
        );
      const plutusScriptSource = withdrawal.scriptSource as ScriptSource;
      if (!plutusScriptSource) {
        throw new Error(
          "A script source for a plutus certificate was not plutus script somehow",
        );
      }
      if (!withdrawal.redeemer) {
        throw new Error("A redeemer was not provided for a plutus certificate");
      }

      // Add withdraw redeemer to witness set
      let redeemers = this.txWitnessSet.redeemers() ?? Redeemers.fromCore([]);
      let redeemersList = [...redeemers.values()];
      redeemersList.push(
        new Redeemer(
          RedeemerTag.Reward,
          BigInt(index),
          fromBuilderToPlutusData(withdrawal.redeemer.data),
          new ExUnits(
            BigInt(withdrawal.redeemer.exUnits.mem),
            BigInt(withdrawal.redeemer.exUnits.steps),
          ),
        ),
      );
      redeemers.setValues(redeemersList);
      this.txWitnessSet.setRedeemers(redeemers);

      if (plutusScriptSource.type === "Provided") {
        this.addProvidedPlutusScript(plutusScriptSource.script);
      } else if (plutusScriptSource.type === "Inline") {
        this.addScriptRef(plutusScriptSource);
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
      toCardanoAddress(collateral.txIn.address),
      toValue(collateral.txIn.amount),
    );
    this.utxoContext.set(cardanoTxIn, cardanoTxOut);
    this.txBody.setCollateral(collateralInputs);
  };

  private addCollateralReturn = (
    totalCollateral: string,
    collaterals: PubKeyTxIn[],
    collateralReturnAddress: string,
  ) => {
    let collateralReturnValue = Value.fromCore({
      coins: -BigInt(totalCollateral),
    });
    for (const collateral of collaterals) {
      collateralReturnValue = mergeValue(
        collateralReturnValue,
        toValue(collateral.txIn.amount!),
      );
    }
    const collateralReturn = new TransactionOutput(
      toCardanoAddress(collateralReturnAddress),
      collateralReturnValue,
    );
    this.txBody.setCollateralReturn(collateralReturn);
  };

  private setValidityInterval = (validity: ValidityRange) => {
    if (validity.invalidBefore) {
      this.txBody.setValidityStartInterval(Slot(validity.invalidBefore));
    }
    if (validity.invalidHereafter) {
      this.txBody.setTtl(Slot(validity.invalidHereafter));
    }
  };

  private setFee = (fee: string) => {
    this.txBody.setFee(BigInt(fee));
  };

  private addAllRequiredSignatures = (requiredSignatures: string[]) => {
    const requiredSigners: Serialization.CborSet<
      Ed25519KeyHashHex,
      Serialization.Hash<Ed25519KeyHashHex>
    > = this.txBody.requiredSigners() ??
    Serialization.CborSet.fromCore([], Serialization.Hash.fromCore);

    let requiredSignerValues = [...requiredSigners.values()];
    for (const requiredSigner of requiredSignatures) {
      requiredSignerValues.push(
        Serialization.Hash.fromCore(Ed25519KeyHashHex(requiredSigner)),
      );
    }
    requiredSigners.setValues(requiredSignerValues);
    this.txBody.setRequiredSigners(requiredSigners);
  };

  private addMetadata = (metadata: TxMetadata) => {
    this.txAuxilliaryData.setMetadata(
      new Serialization.GeneralTransactionMetadata(
        toCardanoMetadataMap(metadata),
      ),
    );
  };

  private createMockedWitnessSet = (
    requiredSignaturesCount: number,
    requiredByronSignatures: string[],
  ): TransactionWitnessSet => {
    this.buildWitnessSet();
    const clonedWitnessSet = TransactionWitnessSet.fromCbor(
      this.txWitnessSet.toCbor(),
    );
    const bootstrapWitnesses = this.mockBootstrapWitnesses(
      requiredByronSignatures,
    );
    const vkeyWitnesses = this.mockVkeyWitnesses(requiredSignaturesCount);

    const bootstrapsSet = CborSet.fromCore([], BootstrapWitness.fromCore);
    bootstrapsSet.setValues(bootstrapWitnesses);
    clonedWitnessSet.setBootstraps(bootstrapsSet);

    const vkeysSet = CborSet.fromCore([], VkeyWitness.fromCore);
    vkeysSet.setValues(vkeyWitnesses);
    clonedWitnessSet.setVkeys(vkeysSet);

    return clonedWitnessSet;
  };

  private buildWitnessSet = () => {
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

    this.scriptsProvided.forEach((scriptHex) => {
      const script = Script.fromCbor(HexBlob(scriptHex));
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

    let datumsList = [...datums.values()];
    this.datumsProvided.forEach((datum) => {
      datumsList.push(datum);
    });
    datums.setValues(datumsList);
    this.txWitnessSet.setPlutusData(datums);

    // After building tx witness set, we must hash it with the cost models
    // and put the hash in the tx body
    let costModelV1 = Serialization.CostModel.newPlutusV1(
      DEFAULT_V1_COST_MODEL_LIST,
    );
    let costModelV2 = Serialization.CostModel.newPlutusV2(
      DEFAULT_V2_COST_MODEL_LIST,
    );
    let costModelV3 = Serialization.CostModel.newPlutusV3(
      DEFAULT_V3_COST_MODEL_LIST,
    );
    let costModels = new Serialization.Costmdls();

    if (this.usedLanguages[PlutusLanguageVersion.V1]) {
      costModels.insert(costModelV1);
    }
    if (this.usedLanguages[PlutusLanguageVersion.V2]) {
      costModels.insert(costModelV2);
    }
    if (this.usedLanguages[PlutusLanguageVersion.V3]) {
      costModels.insert(costModelV3);
    }
    const redeemers = this.txWitnessSet.redeemers() ?? Redeemers.fromCore([]);
    let scriptDataHash = hashScriptData(
      costModels,
      redeemers,
      datums.size() > 0 ? datums : undefined,
    );
    if (scriptDataHash) {
      this.txBody.setScriptDataHash(scriptDataHash);
    }
    let auxiliaryDataHash = computeAuxiliaryDataHash(
      this.txAuxilliaryData.toCore(),
    );
    if (auxiliaryDataHash) {
      this.txBody.setAuxiliaryDataHash(auxiliaryDataHash);
    }
  };

  private removeInputRefInputOverlap = () => {
    let refInputsValues: TransactionInput[] = [];
    const inputs = this.txBody.inputs()?.values();
    if (this.txBody.referenceInputs()) {
      const currentRefInputValues = this.txBody.referenceInputs()!.values();
      currentRefInputValues.forEach((refInput) => {
        let found = false;
        for (let i = 0; i < inputs.length; i++) {
          if (refInput.toCbor() === inputs[i]!.toCbor()) {
            found = true;
          }
        }
        if (!found) {
          refInputsValues.push(refInput);
        }
      });
      this.txBody.setReferenceInputs(
        Serialization.CborSet.fromCore(
          refInputsValues.map((input) => input.toCore()),
          TransactionInput.fromCore,
        ),
      );
    }
  };

  private removeBodyInputRefInputOverlap = (
    inputs: TxIn[],
    refInputs: RefTxIn[],
  ) => {
    let finalRefInputs = [];
    for (let i = 0; i < refInputs.length; i++) {
      let refInput = refInputs[i]!;
      if (
        !inputs.some(
          (input) =>
            input.txIn.txHash === refInput.txHash &&
            input.txIn.txIndex === refInput.txIndex,
        )
      ) {
        finalRefInputs.push(refInput);
      }
    }
    return finalRefInputs;
  };

  private addScriptRef = (scriptSource: ScriptSource): void => {
    if (scriptSource.type !== "Inline") {
      return;
    }
    if (!scriptSource.scriptSize) {
      throw new Error(
        "A reference script was used without providing its size, this must be provided as fee calculations are based on it",
      );
    }
    this.addReferenceInput({
      txHash: scriptSource.txHash,
      txIndex: scriptSource.txIndex,
      scriptSize: Number(scriptSource.scriptSize),
    });
    switch (scriptSource.version) {
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
  };

  private addSimpleScriptRef = (
    simpleScriptSource: SimpleScriptSourceInfo,
  ): void => {
    if (simpleScriptSource.type !== "Inline") {
      return;
    }
    if (!simpleScriptSource.scriptSize) {
      throw new Error(
        "A reference script was used without providing its size, this must be provided as fee calculations are based on it",
      );
    }
    this.addReferenceInput({
      txHash: simpleScriptSource.txHash,
      txIndex: simpleScriptSource.txIndex,
      scriptSize: Number(simpleScriptSource.scriptSize),
    });
  };

  private addProvidedPlutusScript = (script: PlutusScript) => {
    switch (script.version) {
      case "V1": {
        this.scriptsProvided.add(
          Script.newPlutusV1Script(
            PlutusV1Script.fromCbor(HexBlob(script.code)),
          ).toCbor(),
        );
        this.usedLanguages[PlutusLanguageVersion.V1] = true;
        break;
      }
      case "V2": {
        this.scriptsProvided.add(
          Script.newPlutusV2Script(
            PlutusV2Script.fromCbor(HexBlob(script.code)),
          ).toCbor(),
        );
        this.usedLanguages[PlutusLanguageVersion.V2] = true;
        break;
      }
      case "V3": {
        this.scriptsProvided.add(
          Script.newPlutusV3Script(
            PlutusV3Script.fromCbor(HexBlob(script.code)),
          ).toCbor(),
        );
        this.usedLanguages[PlutusLanguageVersion.V3] = true;
        break;
      }
    }
  };

  private addAllVotes = (votes: Vote[]) => {
    for (let i = 0; i < votes.length; i++) {
      const vote = votes[i];
      switch (vote!.type) {
        case "BasicVote": {
          this.addBasicVote(vote as BasicVote);
          break;
        }
        case "ScriptVote": {
          this.addScriptVote(vote as ScriptVote, i);
          break;
        }
        case "SimpleScriptVote": {
          this.addSimpleScriptVote(vote as SimpleScriptVote);
          break;
        }
      }
    }
  };

  private addBasicVote = (basicVote: BasicVote) => {
    const votes: Serialization.VotingProcedures =
      this.txBody.votingProcedures() ??
      Serialization.VotingProcedures.fromCore([]);

    votes.insert(
      toCardanoVoter(basicVote.vote.voter),
      toCardanoGovernanceActionId(basicVote.vote.govActionId),
      toCardanoVotingProcedure(basicVote.vote.votingProcedure),
    );
    this.txBody.setVotingProcedures(votes);
  };

  private addScriptVote = (vote: ScriptVote, index: number) => {
    if (!vote.scriptSource)
      throw new Error("Script source not provided for plutus script vote");
    const plutusScriptSource = vote.scriptSource as ScriptSource;
    if (!plutusScriptSource) {
      throw new Error(
        "A script source for a plutus certificate was not plutus script somehow",
      );
    }
    if (!vote.redeemer) {
      throw new Error("A redeemer was not provided for a plutus vote");
    }

    // Add withdraw redeemer to witness set
    let redeemers = this.txWitnessSet.redeemers() ?? Redeemers.fromCore([]);
    let redeemersList = [...redeemers.values()];
    redeemersList.push(
      new Redeemer(
        RedeemerTag.Voting,
        BigInt(index),
        fromBuilderToPlutusData(vote.redeemer.data),
        new ExUnits(
          BigInt(vote.redeemer.exUnits.mem),
          BigInt(vote.redeemer.exUnits.steps),
        ),
      ),
    );
    redeemers.setValues(redeemersList);
    this.txWitnessSet.setRedeemers(redeemers);

    if (plutusScriptSource.type === "Provided") {
      this.addProvidedPlutusScript(plutusScriptSource.script);
    } else if (plutusScriptSource.type === "Inline") {
      this.addScriptRef(plutusScriptSource);
    }
    this.addBasicVote({ type: "BasicVote", vote: vote.vote });
  };

  private addSimpleScriptVote = (vote: SimpleScriptVote) => {
    if (!vote.simpleScriptSource)
      throw new Error("Script source not provided for native script vote");
    const nativeScriptSource: SimpleScriptSourceInfo =
      vote.simpleScriptSource as SimpleScriptSourceInfo;
    if (!nativeScriptSource)
      throw new Error(
        "A script source for a native script was not a native script somehow",
      );
    if (nativeScriptSource.type === "Provided") {
      this.scriptsProvided.add(
        Script.newNativeScript(
          NativeScript.fromCbor(HexBlob(nativeScriptSource.scriptCode)),
        ).toCbor(),
      );
    } else if (nativeScriptSource.type === "Inline") {
      this.addSimpleScriptRef(nativeScriptSource);
    }
    this.addBasicVote({ type: "BasicVote", vote: vote.vote });
  };

  private mockVkeyWitnesses = (
    numberOfRequiredWitnesses: number,
  ): VkeyWitness[] => {
    let vkeyWitnesses: VkeyWitness[] = [];
    for (let i = 0; i < numberOfRequiredWitnesses; i++) {
      const numberInHex = this.numberToIntegerHex(i);
      const pubKeyHex = this.mockPubkey(numberInHex);
      const signature = this.mockSignature(numberInHex);
      vkeyWitnesses.push(
        new VkeyWitness(
          Ed25519PublicKeyHex(pubKeyHex),
          Ed25519SignatureHex(signature),
        ),
      );
    }
    return vkeyWitnesses;
  };

  private mockPubkey(numberInHex: string): string {
    return "0"
      .repeat(VKEY_PUBKEY_SIZE_BYTES * 2 - numberInHex.length)
      .concat(numberInHex);
  }

  private mockSignature(numberInHex: string): string {
    return "0"
      .repeat(VKEY_SIGNATURE_SIZE_BYTES * 2 - numberInHex.length)
      .concat(numberInHex);
  }

  private mockChainCode = (numberInHex: string): string => {
    return "0"
      .repeat(CHAIN_CODE_SIZE_BYTES * 2 - numberInHex.length)
      .concat(numberInHex);
  };

  private numberToIntegerHex = (number: number): string => {
    return BigInt(number).toString(16);
  };

  private mockBootstrapWitnesses = (
    byronAddresses: string[],
  ): BootstrapWitness[] => {
    let bootstrapWitnesses: BootstrapWitness[] = [];
    for (let i = 0; i < byronAddresses.length; i++) {
      const address = Address.fromBytes(<HexBlob>byronAddresses[i]).asByron();
      if (!address) {
        throw new Error(`Failed to parse byron address: ${byronAddresses[i]}`);
      }
      const numberInHex = this.numberToIntegerHex(i);
      const pubKeyHex = this.mockPubkey(numberInHex);
      const signature = this.mockSignature(numberInHex);
      const chainCode = this.mockChainCode(numberInHex);
      const attributes = address.getAttributes();
      bootstrapWitnesses.push(
        new BootstrapWitness(
          Ed25519PublicKeyHex(pubKeyHex),
          Ed25519SignatureHex(signature),
          HexBlob(chainCode),
          this.serializeByronAttributes(attributes),
        ),
      );
    }
    return bootstrapWitnesses;
  };

  private serializeByronAttributes = (attributes: ByronAttributes): HexBlob => {
    const writer = new CborWriter();
    let mapSize = 0;
    if (attributes.magic) {
      mapSize++;
    }
    if (attributes.derivationPath) {
      mapSize++;
    }

    writer.writeStartMap(mapSize);
    if (attributes.derivationPath) {
      writer.writeInt(1);
      const encodedPathCbor = new CborWriter()
        .writeByteString(Buffer.from(attributes.derivationPath, "hex"))
        .encode();
      writer.writeByteString(encodedPathCbor);
    }
    if (attributes.magic) {
      writer.writeInt(2);
      const encodedMagicCbor = new CborWriter()
        .writeInt(attributes.magic)
        .encode();
      writer.writeByteString(encodedMagicCbor);
    }
    return writer.encodeAsHex();
  };
}

const throwErrorWithOrigin = (origin: string, error: any) => {
  if (error instanceof Error) {
    throw new Error(`${origin}: ${error.message}`);
  } else if (typeof error === "string") {
    throw new Error(`${origin}: ${error}`);
  } else if (typeof error === "object") {
    throw new Error(`${origin}: ${JSON.stringify(error)}`);
  } else {
    throw new Error(`${origin}: ${String(error)}`);
  }
};
