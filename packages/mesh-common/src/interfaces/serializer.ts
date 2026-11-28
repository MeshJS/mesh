import { PlutusDataType } from "../data";
import { TxTester } from "../tx-tester";
import {
  Asset,
  BuilderData,
  DeserializedAddress,
  DeserializedScript,
  MeshTxBuilderBody,
  NativeScript,
  Output,
  PlutusScript,
  Protocol,
  TransactionPrototype,
  TxInput,
  UTxO,
} from "../types";

export interface IMeshTxSerializer {
  /**
   * @deprecated Serializes a `MeshTxBuilderBody`, which is deprecated; Mesh's builders do not call
   * it. Use `serializeTxPrototype`: `TxBuilder` of `@meshsdk/transaction` builds a
   * `TransactionPrototype` from parts.
   */
  serializeTxBody(
    txBuilderBody: MeshTxBuilderBody,
    protocolParams: Protocol,
  ): string;
  /**
   * @deprecated Serializes a `MeshTxBuilderBody` with placeholder witnesses, to size the signed
   * transaction; Mesh's builders do not call it. `minFee` of `@meshsdk/transaction` gives the
   * minimum fee of a `TransactionPrototype` once signed.
   */
  serializeTxBodyWithMockSignatures(
    txBuilderBody: MeshTxBuilderBody,
    protocolParams: Protocol,
  ): string;
  /**
   * Serializes a fully resolved `TransactionPrototype` to transaction CBOR, as is: nothing is
   * added, sorted or recomputed. Optional, so that a serializer written before it still fits the
   * interface; `TxBuilder` of `@meshsdk/transaction` takes only a serializer that has it.
   */
  serializeTxPrototype?(txPrototype: TransactionPrototype): string;
  addSigningKeys(txHex: string, signingKeys: string[]): string;
  serializeData(data: BuilderData): string;
  serializeAddress(address: DeserializedAddress, networkId?: 0 | 1): string;
  serializePoolId(hash: string): string;
  serializeRewardAddress(
    stakeKeyHash: string,
    isScriptHash?: boolean,
    network_id?: 0 | 1,
  ): string;
  serializeOutput(output: Output): string;
  serializeValue(value: Asset[]): string;
  resolver: IResolver;
  deserializer: IDeserializer;
  parser: ITxParser;
}

export interface ITxParser {
  getRequiredInputs(txHex: string): TxInput[];
  parse(txHex: string, resolvedUtxos?: UTxO[]): void;
  toTester(): TxTester;
  getBuilderBody(): MeshTxBuilderBody;
  getBuilderBodyWithoutChange(): MeshTxBuilderBody;
}

export interface IResolver {
  keys: {
    resolvePrivateKey(words: string[]): string;
    resolveRewardAddress(bech32: string): string;
    resolveEd25519KeyHash(bech32: string): string;
    resolveStakeKeyHash(bech32: string): string;
  };
  tx: {
    resolveTxHash(txHex: string): string;
  };
  data: {
    resolveDataHash(
      rawData: BuilderData["content"],
      type?: PlutusDataType,
    ): string;
  };
  script: {
    resolveScriptRef(script: NativeScript | PlutusScript): string;
  };
}

export interface IDeserializer {
  key: {
    deserializeAddress(bech32: string): DeserializedAddress;
  };
  script: {
    deserializeNativeScript(script: NativeScript): DeserializedScript;
    deserializePlutusScript(script: PlutusScript): DeserializedScript;
  };
  cert: {
    deserializePoolId(poolId: string): string;
  };
}
