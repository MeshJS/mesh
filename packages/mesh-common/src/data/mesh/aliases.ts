import { POLICY_ID_LENGTH } from "../../constants";
import { Data } from "../../types";
import { mConStr0, MConStr0, mConStr1, MConStr1 } from "./constructors";

/**
 * @typealias MAssetClass
 * @description
 * PlutusTx alias, represents a Cardano asset class in Mesh Data type as a constructor object with currency symbol and token name.
 *
 * @purpose
 * TODO
 *
 * @property {MConStr0<[string, string]>}
 *   Constructor object with two string fields: currency symbol (hex) and token name (hex).
 *   - Example: `mConStr0(["5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a", "7075707079"])`
 */
export type MAssetClass = MConStr0<[string, string]>;

/**
 * @typealias MOutputReference
 * @description
 * Represents a Cardano output reference in Mesh Data type as a constructor object with transaction hash and output index.
 *
 * @purpose
 * TODO
 *
 * @property {MConStr0<[string, number]>}
 *   Constructor object with transaction hash (hex string) and output index (number).
 *   - Example: `mConStr0(["766a7f683444256f0b17cb5fb125f7cb3e2210f2784347848ea2f6917d080a1c", 1])`
 */
export type MOutputReference = MConStr0<[string, number]>;

/**
 * @typealias MTxOutRef
 * @description
 * PlutusTx alias, represents a Cardano transaction output reference in Mesh Data type as a nested constructor object.
 *
 * @purpose
 * TODO
 *
 * @property {MConStr0<[MConStr0<[string]>, number]>}
 *   Constructor object with nested transaction hash constructor and output index.
 *   - Example: `mConStr0([mConStr0(["766a7f683444256f0b17cb5fb125f7cb3e2210f2784347848ea2f6917d080a1c"]), 1])`
 */
export type MTxOutRef = MConStr0<[MConStr0<[string]>, number]>;

/**
 * @typealias MTuple
 * @description
 * Represents a Mesh Data tuple as an array of values.
 * Aiken alias for encoding tuple structures in Cardano smart contracts.
 *
 * @purpose
 * TODO
 *
 * @property {T[]}
 *   Array of tuple elements.
 *   - Example: `["mesh", "coin"]`
 */
export type MTuple<T extends any> = T[];

/**
 * @typealias MOption
 * @description
 * Represents a Mesh Data Option type as either Some or None.
 * Aiken alias for encoding optional values in Cardano smart contracts.
 *
 * @purpose
 * TODO
 *
 * @property {MSome<T> | MNone} value
 *   Option value, either Some (with value) or None.
 *   - Example: `mSome("mesh")` or `mNone()`
 */
export type MOption<T> = MSome<T> | MNone;

/**
 * @typealias MSome
 * @description
 * Represents a Mesh Data Some type as a constructor object with a value.
 * Aiken alias for encoding present optional values in Cardano smart contracts.
 *
 * @purpose
 * TODO
 *
 * @property {MConStr0<[T]>}
 *   Constructor object with a single value field.
 *   - Example: `mConStr0(["mesh"])`
 */
export type MSome<T> = MConStr0<[T]>;

/**
 * @typealias MNone
 * @description
 * Represents a Mesh Data None type as a constructor object with no fields.
 * Aiken alias for encoding absent optional values in Cardano smart contracts.
 *
 * @purpose
 * TODO
 *
 * @property {MConStr1<[]>}
 *   Constructor object with no fields.
 *   - Example: `mConStr1([])`
 */
export type MNone = MConStr1<[]>;

/**
 * @function mAssetClass
 * @description
 * Creates a Mesh Data asset class object with a currency symbol and token name in hex format.
 *
 * @purpose
 * TODO
 *
 * @param {string} currencySymbolHex
 * The currency symbol in hex.
 *   - Must be a 56-character hex string or empty string for lovelace.
 *   - Example value: `"5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a"`
 *
 * @param {string} tokenNameHex
 * The token name in hex.
 *   - Must be a hex string up to 64 characters.
 *   - Example value: `"7075707079"` (for "puppy")
 *
 * @returns {MAssetClass}
 * Mesh Data asset class object.
 *   - Example: `mConStr0(["5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a", "7075707079"])`
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
 * @function mOutputReference
 * @description
 * Creates a Mesh Data output reference object with a transaction hash and output index.
 *
 * @purpose
 * TODO
 *
 * @param {string} txHash
 * The transaction hash in hex.
 *   - Must be a 64-character hex string.
 *   - Example value: `"766a7f683444256f0b17cb5fb125f7cb3e2210f2784347848ea2f6917d080a1c"`
 *
 * @param {number} index
 * The index of the output.
 *   - Must be a non-negative integer.
 *   - Example value: `1`
 *
 * @returns {MOutputReference}
 * Mesh Data output reference object.
 *   - Example: `mConStr0(["766a7f683444256f0b17cb5fb125f7cb3e2210f2784347848ea2f6917d080a1c", 1])`
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
 * @function mTxOutRef
 * @description
 * Creates a Mesh Data TxOutRef object with a transaction hash and output index.
 *
 * @purpose
 * TODO
 *
 * @param {string} txHash
 * The transaction hash in hex.
 *   - Must be a 64-character hex string.
 *   - Example value: `"766a7f683444256f0b17cb5fb125f7cb3e2210f2784347848ea2f6917d080a1c"`
 *
 * @param {number} index
 * The index of the output.
 *   - Must be a non-negative integer.
 *   - Example value: `1`
 *
 * @returns {MTxOutRef}
 * Mesh Data TxOutRef object.
 *   - Example: `mConStr0([mConStr0(["766a7f683444256f0b17cb5fb125f7cb3e2210f2784347848ea2f6917d080a1c"]), 1])`
 */
export const mTxOutRef = (txHash: string, index: number): MTxOutRef => {
  if (txHash.length !== 64) {
    throw new Error("Invalid transaction hash - should be 32 bytes long");
  }
  return mConStr0([mConStr0([txHash]), index]);
};

/**
 * @function mTuple
 * @description
 * Creates a Mesh Data tuple object with an array of arguments.
 *
 * @purpose
 * TODO
 *
 * @param {any[]} args
 * The arguments of the tuple.
 *   - Must be a list of values.
 *   - Example value: `["mesh", "coin"]`
 *
 * @returns {MTuple<any>}
 * Mesh Data tuple object.
 *   - Example: `["mesh", "coin"]`
 */
export const mTuple = <T extends any[]>(...args: T): MTuple<T> => args;

/**
 * @function mOption
 * @description
 * Creates a Mesh Data Option object as either MSome or MNone.
 *
 * @purpose
 * TODO
 *
 * @param {Data} value
 * The value of the option.
 *   - Optional; if provided, creates Some, otherwise None.
 *   - Example value: `"mesh"`
 *
 * @returns {MOption<Data>}
 * Mesh Data Option object.
 *   - Example: `mSome("mesh")` or `mNone()`
 */
export const mOption = <T extends Data>(value?: T): MOption<T> => {
  if (value) {
    return mSome(value);
  }
  return mNone();
};

/**
 * @function mSome
 * @description
 * Creates a Mesh Data Some object with a value.
 *
 * @purpose
 * TODO
 *
 * @param {Data} value
 * The value to wrap in MSome.
 *   - Must be a valid Data value.
 *   - Example value: `"mesh"`
 *
 * @returns {MSome<Data>}
 * Mesh Data Option - Some object.
 *   - Example: `mConStr0(["mesh"])`
 */
export const mSome = <T extends Data>(value: T): MSome<T> =>
  mConStr0([value]) as MSome<T>;

/**
 * @function mNone
 * @description
 * Creates a Mesh Data Option - None object with no value.
 *
 * @purpose
 * TODO
 *
 * @returns {MNone}
 * Mesh Data Option - None object.
 *   - Example: `mConStr1([])`
 */
export const mNone = (): MNone => mConStr1([]);
