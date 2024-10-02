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
    BuiltinByteString,
    ScriptAddress,
    BuiltinByteString,
    ScriptAddress,
    Integer,
    BuiltinByteString,
    ScriptAddress,
    Integer,
    BuiltinByteString,
    BuiltinByteString,
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
