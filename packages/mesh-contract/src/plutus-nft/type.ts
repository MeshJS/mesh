import { ConStr0, Integer, PubKeyHash } from "@meshsdk/common";

export type OracleDatum = ConStr0<[Integer, PubKeyHash]>;
