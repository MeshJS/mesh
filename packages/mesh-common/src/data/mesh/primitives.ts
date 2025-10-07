import { MConStr0, mConStr0, MConStr1, mConStr1 } from "./constructors";

/**
 * @typealias MBool
 * @description
 * Represents the Mesh Data boolean type as a constructor object.
 *
 * @purpose
 * TODO
 *
 * @property {MConStr0<[]> | MConStr1<[]>}
 *   - `MConStr0<[]>`: Represents `false`.
 *   - `MConStr1<[]>`: Represents `true`.
 *   - Example: `const b: MBool = mConStr1([]); // true`
 */
export type MBool = MConStr0<[]> | MConStr1<[]>;

/**
 * @function mBool
 * @description
 * Creates a Mesh Data boolean object for Cardano Plutus data encoding.
 *
 * @purpose
 * TODO
 *
 * @param {boolean} b
 * The boolean value to encode.
 *
 * @returns {MBool}
 * Mesh Data boolean object representing the input value.
 *   - Example: `mConStr1([])` for `true`, `mConStr0([])` for `false`
 */
export const mBool = (b: boolean): MBool =>
  b ? mConStr1<[]>([]) : mConStr0<[]>([]);

/**
 * @function mStringToPlutusBSArray
 * @description
 * Converts a hex string into a BuiltinByteString Array, with a maximum of 32 bytes per item.
 *
 * @purpose
 * TODO
 *
 * @param {string} hexString
 * The hex string to be converted.
 *   - Must be a valid hex string.
 *   - Example value: `"6d657368636f696e4d657368636f696e4d657368636f696e4d657368636f696e4d657368636f696e"`
 *
 * @returns {string[]}
 * BuiltinByteString Array representation of the hex string, each item up to 32 bytes.
 *   - Example: `["6d657368636f696e4d657368636f696e4d657368636f696e4d657368636f696e", "4d657368636f696e"]`
 */
export const mStringToPlutusBSArray = (hexString: string): string[] => {
  const chunks = [];
  for (let i = 0; i < hexString.length; i += 64) {
    const chunk = hexString.substring(i, i + 64);
    chunks.push(chunk);
  }
  return chunks;
};

/**
 * @function mPlutusBSArrayToString
 * @description
 * Converts a BuiltinByteString Array into a single string.
 *
 * @purpose
 * TODO
 *
 * @param {string[]} bsArray
 * The BuiltinByteString Array to be converted.
 *   - Must be an array of hex string segments.
 *   - Example value: `["6d657368636f696e4d657368636f696e4d657368636f696e4d657368636f696e", "4d657368636f696e"]`
 *
 * @returns {string}
 * String representation of the concatenated BuiltinByteString Array.
 *   - Example: `"6d657368636f696e4d657368636f696e4d657368636f696e4d657368636f696e4d657368636f696e"`
 */
export const mPlutusBSArrayToString = (bsArray: string[]): string => {
  return bsArray.join("");
};
