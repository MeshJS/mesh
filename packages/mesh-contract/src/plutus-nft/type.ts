import { ConStr0, Integer, PubKeyAddress } from "@meshsdk/common";

export type OracleDatum = ConStr0<[Integer, Integer, PubKeyAddress]>;
