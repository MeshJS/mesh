import {
  BuiltinByteString,
  ConStr0,
  Integer,
  List,
  ScriptAddress,
  UTxO,
} from "@meshsdk/core";

export type OracleDatum = ConStr0<
  [
    BuiltinByteString, // oracle_nft: PolicyId,
    ScriptAddress, // oracle_address: Address,
    BuiltinByteString, // content_registry_ref_token: PolicyId,
    ScriptAddress, // content_registry_address: Address,
    Integer, // content_registry_count: Int,
    BuiltinByteString, // ownership_registry_ref_token: PolicyId,
    ScriptAddress, // ownership_registry_address: Address,
    Integer, // ownership_registry_count: Int,
    BuiltinByteString, // operation_key: ByteArray,
    BuiltinByteString, // stop_key: ByteArray,
  ]
>;

export type ContentRegistryDatum = ConStr0<[Integer, List<BuiltinByteString>]>;

export type OwnershipRegistryDatum = ConStr0<
  [Integer, List<{ list: [BuiltinByteString, BuiltinByteString] }>]
>;

export type UpdateContent = {
  ownerTokenUtxo: UTxO;
  registryNumber: number;
  newContentHashHex: string;
  contentNumber: number;
};

export type TransferContent = {
  ownerTokenUtxo: UTxO;
  registryNumber: number;
  newOwnerAssetHex: string;
  contentNumber: number;
};
