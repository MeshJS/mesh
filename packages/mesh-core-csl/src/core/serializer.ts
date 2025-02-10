/* eslint-disable default-case */
/* eslint-disable class-methods-use-this */
/* eslint-disable radix */
import JSONbig from "json-bigint";

import type {
  BuilderData,
  Data,
  DeserializedAddress,
  DeserializedScript,
  IDeserializer,
  IMeshTxSerializer,
  IResolver,
  MeshTxBuilderBody,
  NativeScript,
  PlutusScript,
  Protocol,
} from "@meshsdk/common";
import {
  DEFAULT_PROTOCOL_PARAMETERS,
  emptyTxBuilderBody,
} from "@meshsdk/common";

import {
  csl,
  deserializePlutusScript,
  resolveDataHash,
  resolveEd25519KeyHash,
  resolvePrivateKey,
  resolveRewardAddress,
  resolveScriptRef,
  serializePoolId,
  toNativeScript,
} from "../deser";
import {
  calculateTxHash,
  deserializeBech32Address,
  keyHashToRewardAddress,
  rewardAddressToKeyHash,
  scriptHashToRewardAddress,
  serialzeAddress,
  signTransaction,
} from "../utils";
import { meshTxBuilderBodyToObj } from "./adaptor";
import { builderDataToCbor } from "./adaptor/data";

export class CSLSerializer implements IMeshTxSerializer {
  /**
   * Set to true to enable verbose logging for the txBodyJson prior going into build
   */
  verbose: boolean;
  protocolParams: Protocol;

  meshTxBuilderBody: MeshTxBuilderBody = emptyTxBuilderBody();

  constructor(protocolParams?: Protocol, verbose = false) {
    this.protocolParams = protocolParams || DEFAULT_PROTOCOL_PARAMETERS;
    this.verbose = verbose;
  }

  serializeTxBody(
    txBody: MeshTxBuilderBody,
    protocolParams?: Protocol,
  ): string {
    const txBodyJson = JSONbig.stringify(meshTxBuilderBodyToObj(txBody));

    const params = JSONbig.stringify(protocolParams || this.protocolParams);

    if (this.verbose) {
      console.log("txBodyJson", txBodyJson);
    }
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
      resolveDataHash: function (data: Data): string {
        return resolveDataHash(data);
      },
    },
    script: {
      resolveScriptRef: function (script: PlutusScript | NativeScript): string {
        return resolveScriptRef(script);
      },
    },
  };
}
