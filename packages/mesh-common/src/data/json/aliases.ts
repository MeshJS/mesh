/**
 * All the type aliases here represent the type name used in smart contracts from PlutusTx or Aiken.
 * Please be aware that the types constructed here will be invalid when PlutusTx or Aiken team introduces breaking changes.
 */

import { PlutusData } from ".";
import { POLICY_ID_LENGTH } from "../../constants";
import { conStr0, ConStr0 } from "./constructors";
import { byteString, ByteString, integer, Integer } from "./primitives";

/**
 * The Plutus Data script hash in JSON
 */
export type ScriptHash = ByteString;

/**
 * The Plutus Data public key hash in JSON
 */
export type PubKeyHash = ByteString;

/**
 * Aiken alias
 * The Plutus Data policy id in JSON
 */
export type PolicyId = ByteString;

/**
 * PlutusTx alias
 * The Plutus Data currency symbol in JSON
 */
export type CurrencySymbol = ByteString;

/**
 * Aiken alias
 * The Plutus Data asset name in JSON
 */
export type AssetName = ByteString;

/**
 * PlutusTx alias
 * The Plutus Data token name in JSON
 */
export type TokenName = ByteString;

/**
 * PlutusTx alias
 * The Plutus Data asset class in JSON
 */
export type AssetClass = ConStr0<[CurrencySymbol, TokenName]>;

/**
 * Aiken alias
 * The Plutus Data output reference in JSON
 */
export type OutputReference = ConStr0<[ByteString, Integer]>;

/**
 * PlutusTx alias
 * The Plutus Data TxOutRef in JSON
 */
export type TxOutRef = ConStr0<[ConStr0<[ByteString]>, Integer]>;

/**
 * PlutusTx alias
 * The Plutus Data POSIX time in JSON
 */
export type POSIXTime = Integer;

/**
 * Aiken alias
 * The Plutus Data dictionary item in JSON
 */
export type DictItem<V> = { k: ByteString; v: V };

/**
 * Aiken alias
 * The Plutus Data dictionary in JSON
 */
export type Dict<V> = { map: DictItem<V>[] };

/**
 * Aiken alias
 * The Plutus Data tuple in JSON
 */
export type Tuple<K, V> = { list: [K, V] };

/**
 * Internal utility function to create a Plutus Data byte string in JSON, checking correct length
 * @param bytes The byte string in hex
 * @returns The Plutus Data byte string object
 */
export const hashByteString = (bytes: string): ByteString => {
  if (bytes.length !== 56) {
    throw new Error(`Invalid hash for [${bytes}] - should be 56 bytes long`);
  }
  return byteString(bytes);
};

/**
 * The utility function to create a Plutus Data script hash in JSON
 * @param bytes The script hash in hex
 * @returns The Plutus Data script hash object
 */
export const scriptHash = (bytes: string): ScriptHash => hashByteString(bytes);

/**
 * The utility function to create a Plutus Data pub key hash in JSON
 * @param bytes The script hash in hex
 * @returns The Plutus Data script hash object
 */
export const pubKeyHash = (bytes: string): ScriptHash => hashByteString(bytes);

/**
 * The utility function to create a Plutus Data policy id in JSON
 * @param bytes The policy id in hex
 * @returns The Plutus Data policy id object
 */
export const policyId = (bytes: string): PolicyId => {
  if (bytes.length !== POLICY_ID_LENGTH && bytes !== "") {
    throw new Error(
      `Invalid policy id for [${bytes}] - should be ${POLICY_ID_LENGTH} bytes long or empty string for lovelace`,
    );
  }
  return byteString(bytes);
};

/**
 * The utility function to create a Plutus Data currency symbol in JSON
 * @param bytes The policy id in hex
 * @returns The Plutus Data policy id object
 */
export const currencySymbol = (bytes: string): CurrencySymbol =>
  policyId(bytes);

/**
 * The utility function to create a Plutus Data asset name in JSON
 * @param bytes The asset name in hex
 * @returns The Plutus Data asset name object
 */
export const assetName = (bytes: string): AssetName => {
  if (bytes.length > 64) {
    throw new Error(
      `Invalid asset name for [${bytes}] - should be less than 32 bytes (64 hex length) long`,
    );
  }
  return byteString(bytes);
};

/**
 * The utility function to create a Plutus Data token name in JSON
 * @param bytes The token name in hex
 * @returns The Plutus Data token name object
 */
export const tokenName = (bytes: string): TokenName => assetName(bytes);

/**
 * The utility function to create a Plutus Data asset class in JSON
 * @param currencySymbolHex The currency symbol in hex
 * @param tokenNameHex The token name in hex
 * @returns The Plutus Data asset class object
 */
export const assetClass = (
  currencySymbolHex: string,
  tokenNameHex: string,
): AssetClass =>
  conStr0([currencySymbol(currencySymbolHex), tokenName(tokenNameHex)]);

/**
 * The utility function to create a Plutus Data output reference in JSON.
 * Note that it is updated since aiken version v1.1.0.
 * If you want to build the type before Chang, please use txOutRef instead.
 * @param txHash The transaction hash
 * @param index The index of the output
 * @returns The Plutus Data output reference object
 */
export const outputReference = (
  txHash: string,
  index: number,
): OutputReference => {
  if (txHash.length !== 64) {
    throw new Error("Invalid transaction hash - should be 32 bytes long");
  }
  return conStr0([byteString(txHash), integer(index)]);
};

/**
 * The utility function to create a Plutus Data TxOutRef in JSON
 * @param txHash The transaction hash
 * @param index The index of the output
 * @returns The Plutus Data TxOutRef object
 */
export const txOutRef = (txHash: string, index: number): TxOutRef => {
  if (txHash.length !== 64) {
    throw new Error("Invalid transaction hash - should be 32 bytes long");
  }
  return conStr0([conStr0([byteString(txHash)]), integer(index)]);
};

/**
 * The utility function to create a Plutus Data POSIX time in JSON
 * @param int The integer value of the POSIX time
 * @returns The Plutus Data POSIX time object
 */
export const posixTime = (int: number): POSIXTime => ({ int });

/**
 * The utility function to create a Plutus Data dictionary in JSON
 * @param itemsMap The items map in array
 * @returns The Plutus Data dictionary object
 */
export const dict = <V>(itemsMap: [ByteString, V][]): Dict<V> => ({
  map: itemsMap.map(([k, v]) => ({ k, v })),
});

/**
 * The utility function to create a Plutus Data tuple in JSON
 * @param key The key of the tuple
 * @param value The value of the tuple
 * @returns The Plutus Data tuple object
 */
export const tuple = <K = PlutusData, V = PlutusData>(
  key: K,
  value: V,
): Tuple<K, V> => ({ list: [key, value] });
