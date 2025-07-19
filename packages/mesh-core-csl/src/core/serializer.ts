/* eslint-disable default-case */
/* eslint-disable class-methods-use-this */
/* eslint-disable radix */
import { js_parse_tx_body } from "@sidan-lab/whisky-js-nodejs";
import JSONbig from "json-bigint";

import {
  Asset,
  BuilderData,
  DEFAULT_PROTOCOL_PARAMETERS,
  DeserializedAddress,
  DeserializedScript,
  emptyTxBuilderBody,
  IDeserializer,
  IMeshTxSerializer,
  IResolver,
  ITxParser,
  MeshTxBuilderBody,
  NativeScript,
  Output,
  PlutusDataType,
  PlutusScript,
  Protocol,
  TxInput,
  TxTester,
  UTxO,
} from "@meshsdk/common";

import {
  castDataToPlutusData,
  csl,
  deserializePlutusScript,
  resolveDataHash,
  resolveEd25519KeyHash,
  resolvePrivateKey,
  resolveRewardAddress,
  resolveScriptRef,
  serializePoolId,
  toCslValue,
  toNativeScript,
} from "../deser";
import { CSLParser } from "../parser";
import {
  calculateTxHash,
  deserializeBech32Address,
  getRequiredInputs,
  keyHashToRewardAddress,
  rewardAddressToKeyHash,
  scriptHashToRewardAddress,
  serialzeAddress,
  signTransaction,
} from "../utils";
import { meshTxBuilderBodyToObj, txBuilderBodyFromObj } from "./adaptor";
import { builderDataToCbor } from "./adaptor/toObj/data";

const VKEY_PUBKEY_SIZE_BYTES = 32;
const VKEY_SIGNATURE_SIZE_BYTES = 64;
const CHAIN_CODE_SIZE_BYTES = 32;

export class CSLSerializer implements IMeshTxSerializer {
  /**
   * Set to true to enable verbose logging for the txBodyJson prior going into build
   */
  protocolParams: Protocol;

  meshTxBuilderBody: MeshTxBuilderBody = emptyTxBuilderBody();

  parserTxBody: MeshTxBuilderBody = emptyTxBuilderBody();

  constructor(protocolParams?: Protocol) {
    this.protocolParams = protocolParams || DEFAULT_PROTOCOL_PARAMETERS;
  }

  serializeTxBody(
    txBody: MeshTxBuilderBody,
    protocolParams?: Protocol,
  ): string {
    const txBodyJson = JSONbig.stringify(meshTxBuilderBodyToObj(txBody));
    const params = JSONbig.stringify(protocolParams || this.protocolParams);

    const txBuildResult = csl.js_serialize_tx_body(txBodyJson, params);
    if (txBuildResult.get_status() !== "success") {
      throw new Error(`txBuildResult error: ${txBuildResult.get_error()}`);
    }
    return txBuildResult.get_data();
  }

  addSigningKeys(txHex: string, signingKeys: string[]): string {
    if (signingKeys.length > 0) {
      return signTransaction(txHex, signingKeys);
    }
    return txHex;
  }

  serializeData(data: BuilderData): string {
    return builderDataToCbor(data);
  }

  serializeAddress(
    address: Partial<DeserializedAddress>,
    networkId?: number,
  ): string {
    return serialzeAddress(address, networkId);
  }

  serializePoolId(hash: string): string {
    return serializePoolId(hash);
  }

  serializeRewardAddress(
    stakeKeyHash: string,
    isScriptHash?: boolean,
    network_id?: 0 | 1,
  ): string {
    return isScriptHash
      ? scriptHashToRewardAddress(stakeKeyHash, network_id)
      : keyHashToRewardAddress(stakeKeyHash, network_id);
  }

  deserializer: IDeserializer = {
    key: {
      deserializeAddress: function (bech32: string): DeserializedAddress {
        return deserializeBech32Address(bech32);
      },
    },
    script: {
      deserializeNativeScript: function (
        script: NativeScript,
      ): DeserializedScript {
        const nativeScript = toNativeScript(script);
        const scriptCbor = nativeScript.to_hex();
        const scriptHash = nativeScript.hash().to_hex();
        return {
          scriptHash,
          scriptCbor,
        };
      },
      deserializePlutusScript: function (
        script: PlutusScript,
      ): DeserializedScript {
        const scriptHash = deserializePlutusScript(script.code, script.version)
          .hash()
          .to_hex();
        return { scriptHash, scriptCbor: script.code };
      },
    },
    cert: {
      deserializePoolId: function (poolId: string): string {
        return resolveEd25519KeyHash(poolId);
      },
    },
  };

  resolver: IResolver = {
    keys: {
      resolveStakeKeyHash: function (bech32: string): string {
        return (
          rewardAddressToKeyHash(bech32) ||
          deserializeBech32Address(bech32).stakeCredentialHash
        );
      },
      resolvePrivateKey: function (words: string[]): string {
        return resolvePrivateKey(words);
      },
      resolveRewardAddress: function (bech32: string): string {
        return resolveRewardAddress(bech32);
      },
      resolveEd25519KeyHash: function (bech32: string): string {
        return resolveEd25519KeyHash(bech32);
      },
    },
    tx: {
      resolveTxHash: function (txHex: string): string {
        return calculateTxHash(txHex);
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
      resolveScriptRef: function (script: PlutusScript | NativeScript): string {
        return resolveScriptRef(script);
      },
    },
  };

  serializeOutput(output: Output): string {
    let cslOutputBuilder = csl.TransactionOutputBuilder.new().with_address(
      csl.Address.from_bech32(output.address),
    );
    if (output.datum?.type === "Hash") {
      cslOutputBuilder.with_data_hash(
        csl.hash_plutus_data(castDataToPlutusData(output.datum.data)),
      );
    } else if (output.datum?.type === "Inline") {
      cslOutputBuilder.with_plutus_data(
        castDataToPlutusData(output.datum.data),
      );
    } else if (output.datum?.type === "Embedded") {
      throw new Error("Embedded datum not supported");
    }
    if (output.referenceScript) {
      switch (output.referenceScript.version) {
        case "V1": {
          cslOutputBuilder.with_script_ref(
            csl.ScriptRef.new_plutus_script(
              csl.PlutusScript.from_hex_with_version(
                output.referenceScript.code,
                csl.Language.new_plutus_v1(),
              ),
            ),
          );
          break;
        }
        case "V2": {
          cslOutputBuilder.with_script_ref(
            csl.ScriptRef.new_plutus_script(
              csl.PlutusScript.from_hex_with_version(
                output.referenceScript.code,
                csl.Language.new_plutus_v2(),
              ),
            ),
          );
          break;
        }
        case "V3": {
          cslOutputBuilder.with_script_ref(
            csl.ScriptRef.new_plutus_script(
              csl.PlutusScript.from_hex_with_version(
                output.referenceScript.code,
                csl.Language.new_plutus_v3(),
              ),
            ),
          );
          break;
        }
        default: {
          cslOutputBuilder.with_script_ref(
            csl.ScriptRef.new_native_script(
              csl.NativeScript.from_hex(output.referenceScript.code),
            ),
          );
          break;
        }
      }
    }

    return cslOutputBuilder
      .next()
      .with_value(toCslValue(output.amount))
      .build()
      .to_hex();
  }

  serializeTxBodyWithMockSignatures(
    txBuilderBody: MeshTxBuilderBody,
    protocolParams: Protocol,
  ): string {
    const txHex = this.serializeTxBody(txBuilderBody, protocolParams);
    const cslTx = csl.Transaction.from_hex(txHex);
    const mockWitnessSet = cslTx.witness_set();
    const mockVkeyWitnesses = mockWitnessSet.vkeys() ?? csl.Vkeywitnesses.new();
    const mockBootstrapWitnesses =
      mockWitnessSet.bootstraps() ?? csl.BootstrapWitnesses.new();
    for (let i = 0; i < txBuilderBody.expectedNumberKeyWitnesses; i++) {
      const numberInHex = this.numberToIntegerHex(i);
      const mockVkey = csl.Vkey.new(
        csl.PublicKey.from_hex(this.mockPubkey(numberInHex)),
      );

      const mockSignature = csl.Ed25519Signature.from_hex(
        this.mockSignature(numberInHex),
      );
      mockVkeyWitnesses.add(csl.Vkeywitness.new(mockVkey, mockSignature));
    }
    this.meshTxBuilderBody.expectedByronAddressWitnesses.forEach(
      (bootstrapWitness, i) => {
        const address = csl.ByronAddress.from_base58(bootstrapWitness);
        const numberInHex = this.numberToIntegerHex(i);
        const pubKeyHex = this.mockPubkey(numberInHex);
        const mockVkey = csl.Vkey.new(csl.PublicKey.from_hex(pubKeyHex));
        const signature = this.mockSignature(numberInHex);
        const chainCode = this.mockChainCode(numberInHex);
        mockBootstrapWitnesses.add(
          csl.BootstrapWitness.new(
            mockVkey,
            csl.Ed25519Signature.from_hex(signature),
            Buffer.from(chainCode, "hex"),
            address.attributes(),
          ),
        );
      },
    );
    mockWitnessSet.set_vkeys(mockVkeyWitnesses);
    mockWitnessSet.set_bootstraps(mockBootstrapWitnesses);
    return csl.Transaction.new(
      cslTx.body(),
      mockWitnessSet,
      cslTx.auxiliary_data(),
    ).to_hex();
  }

  serializeValue(value: Asset[]): string {
    return toCslValue(value).to_hex();
  }

  parser: ITxParser = {
    getRequiredInputs: function (txHex: string): TxInput[] {
      return getRequiredInputs(txHex);
    },
    parse: (txHex: string, resolvedUtxos: UTxO[] = []) => {
      const parser = new CSLParser(txHex, resolvedUtxos);
      this.parserTxBody = parser.txBuilderBody;
    },
    toTester: () => {
      return new TxTester(this.parserTxBody);
    },
    getBuilderBody: () => {
      return this.parserTxBody;
    },
    getBuilderBodyWithoutChange: () => {
      const txBuilderBody = { ...this.parserTxBody };
      txBuilderBody.outputs = txBuilderBody.outputs.slice(0, -1);
      return txBuilderBody;
    },
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
}
