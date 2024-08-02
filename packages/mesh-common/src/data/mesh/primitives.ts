import { MConStr0, mConStr0, MConStr1, mConStr1 } from "./constructors";

/**
 * The Mesh Data boolean
 */
export type MBool = MConStr0<[]> | MConStr1<[]>;

/**
 * The utility function to create a Mesh Data boolean
 * @param b boolean value
 * @returns The Mesh Data boolean object
 */
export const mBool = (b: boolean): MBool =>
  b ? mConStr1<[]>([]) : mConStr0<[]>([]);

/**
 * Converting a hex string into a BuiltinByteString Array, with max 32 bytes on each items
 * @param hexString The hex string to be converted into BuiltinByteString Array
 * @returns The BuiltinByteString Array representation of the hex string
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
 * Converting BuiltinByteString Array into a single string
 * @param bsArray The BuiltinByteString Array to be converted into a single string
 * @returns The string representation of the BuiltinByteString Array
 */
export const mPlutusBSArrayToString = (bsArray: string[]): string => {
  return bsArray.join("");
};
