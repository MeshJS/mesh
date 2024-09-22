import { ConStr0, BuiltinByteString, ScriptAddress, Integer, List } from "@sidan-lab/sidan-csl";

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
    BuiltinByteString
  ]
>;

export type ContentRegistryDatum = ConStr0<[Integer, List<BuiltinByteString>]>;

export type OwnershipRegistryDatum = ConStr0<[Integer, List<{ list: [BuiltinByteString, BuiltinByteString] }>]>;
