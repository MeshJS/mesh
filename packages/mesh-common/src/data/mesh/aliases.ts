import { POLICY_ID_LENGTH } from "../../constants";
import { mConStr0, MConStr0 } from "./constructors";

/**
 * PlutusTx alias
 * The Mesh Data asset class
 */
export type MAssetClass = MConStr0<[string, string]>;

/**
 * Aiken alias
 * The Mesh Data output reference
 */
export type MOutputReference = MConStr0<[string, number]>;

/**
 * PlutusTx alias
 * The Mesh Data TxOutRef
 */
export type MTxOutRef = MConStr0<[MConStr0<[string]>, number]>;

/**
 * Aiken alias
 * The Mesh Data tuple
 */
export type MTuple<K, V> = [K, V];

/**
 * The utility function to create a Mesh Data asset class
 * @param currencySymbolHex The currency symbol in hex
 * @param tokenNameHex The token name in hex
 * @returns The Mesh Data asset class object
 */
export const mAssetClass = (
  currencySymbolHex: string,
  tokenNameHex: string,
): MAssetClass => {
  if (currencySymbolHex.length !== 56 && currencySymbolHex !== "") {
    throw new Error(
      `Invalid policy id for [${currencySymbolHex}] - should be ${POLICY_ID_LENGTH} bytes long or empty string for lovelace`,
    );
  }

  if (tokenNameHex.length > 64) {
    throw new Error(
      `Invalid asset name for [${tokenNameHex}] - should be less than 32 bytes (64 hex length) long`,
    );
  }

  return mConStr0([currencySymbolHex, tokenNameHex]);
};

/**
 * The utility function to create a Mesh Data output reference in Mesh Data type
 * @param txHash The transaction hash
 * @param index The index of the output
 * @returns The Mesh Data output reference object
 */
export const mOutputReference = (
  txHash: string,
  index: number,
): MOutputReference => {
  if (txHash.length !== 64) {
    throw new Error("Invalid transaction hash - should be 32 bytes long");
  }
  return mConStr0([txHash, index]);
};

/**
 * The utility function to create a Mesh Data TxOutRef in Mesh Data type
 * @param txHash The transaction hash
 * @param index The index of the output
 * @returns The Mesh Data TxOutRef object
 */
export const mTxOutRef = (txHash: string, index: number): MTxOutRef => {
  if (txHash.length !== 64) {
    throw new Error("Invalid transaction hash - should be 32 bytes long");
  }
  return mConStr0([mConStr0([txHash]), index]);
};

/**
 * The utility function to create a Mesh Data tuple in Mesh Data type
 * @param key The key of the tuple
 * @param value The value of the tuple
 * @returns The Mesh Data tuple object
 */
export const mTuple = <K, V>(key: K, value: V): MTuple<K, V> => [key, value];
