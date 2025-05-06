import {
  AssetClass,
  Dict,
  OutputReference,
  POSIXTime,
  PubKeyHash,
  Tuple,
} from "./aliases";
import { ConStr } from "./constructors";
import { MaybeStakingHash, PubKeyAddress, ScriptAddress } from "./credentials";
import { AssocMap, Bool, ByteString, Integer, List, Pairs } from "./primitives";

export type PlutusData =
  | ConStr
  | Bool
  | ByteString
  | Integer
  | List
  | AssocMap
  | Pairs
  | MaybeStakingHash
  | PubKeyAddress
  | ScriptAddress
  | AssetClass
  | OutputReference
  | PubKeyHash
  | POSIXTime
  | Dict<any>
  | Tuple<any>;

export * from "./aliases";
export * from "./constructors";
export * from "./credentials";
export * from "./primitives";
export * from "./mpf";
