import { PlutusData } from ".";
import { ConStr0, conStr0, ConStr1, conStr1 } from "./constructors";

/**
 * The Plutus Data boolean in JSON
 */
export type Bool = ConStr0<[]> | ConStr1<[]>;

/**
 * The Plutus Data byte string, representing in hex, in JSON
 */
export type BuiltinByteString = { bytes: string };

/**
 * The Plutus Data byte string, representing in hex, in JSON
 */
export type ByteString = { bytes: string };

/**
 * The Plutus Data integer in JSON
 */
export type Integer = { int: number | bigint };

/**
 * The Plutus Data list in JSON
 */
export type List<T = any> = { list: T[] };

/**
 * PlutusTx alias
 * The Plutus Data association map item in JSON
 */
export type AssocMapItem<K, V> = { k: K; v: V };

/**
 * The Plutus Data association map in JSON
 */
export type AssocMap<K = any, V = any> = { map: AssocMapItem<K, V>[] };

/**
 * The utility function to create a Plutus Data boolean in JSON
 * @param b boolean value
 * @returns The Plutus Data boolean object
 */
export const bool = (b: boolean): Bool =>
  b ? conStr1<[]>([]) : conStr0<[]>([]);

/**
 * The utility function to create a Plutus Data byte string in JSON
 * @param bytes The byte string in hex
 * @returns The Plutus Data byte string object
 */
export const builtinByteString = (bytes: string): BuiltinByteString => {
  return byteString(bytes);
};

/**
 * The utility function to create a Plutus Data byte string in JSON
 * @param bytes The byte string in hex
 * @returns The Plutus Data byte string object
 */
export const byteString = (bytes: string): ByteString => {
  // check if the string is a hex string with regex
  if (bytes.length % 2 !== 0) {
    throw new Error("Invalid hex string - odd length: " + bytes);
  }
  if (!/^[0-9a-fA-F]*$/.test(bytes)) {
    throw new Error("Invalid hex string - non-hex string character: " + bytes);
  }
  return {
    bytes,
  };
};

/**
 * The utility function to create a Plutus Data integer in JSON
 * @param int The integer value
 * @returns The Plutus Data integer object
 */
export const integer = (int: number | bigint): Integer => ({ int });

/**
 * The utility function to create a Plutus Data list in JSON
 * @param pList The list of Plutus Data
 * @param validation Default true - If current data construction would perform validation (introducing this flag due to possible performance issue in loop validation)
 * @returns The Plutus Data list object
 */
export const list = <T = PlutusData>(
  pList: T[],
  validation = true,
): List<T> => {
  if (validation) {
    pList.forEach((item) => {
      if (typeof item !== "object") {
        throw new Error(
          "List item of JSON Cardano data type must be an object - " + item,
        );
      }
    });
  }

  return { list: pList };
};

/**
 * Converting a hex string into a ByteString Array, with max 32 bytes on each items
 * @param hexString The hex string to be converted into ByteString Array
 * @returns The ByteString Array representation of the hex string
 */
export const stringToBSArray = (hexString: string): List<ByteString> => {
  const processRawStringIntoPlutusByteArray = (hexString: string): string[] => {
    const chunks = [];
    for (let i = 0; i < hexString.length; i += 64) {
      const chunk = hexString.substring(i, i + 64);
      chunks.push(chunk);
    }
    return chunks;
  };

  return list(
    processRawStringIntoPlutusByteArray(hexString).map(builtinByteString),
  );
};

/**
 * Converting ByteString Array into a single string
 * @param bsArray The ByteString Array to be converted into a single string
 * @returns The string representation of the ByteString Array
 */
export const plutusBSArrayToString = (bsArray: List<ByteString>): string => {
  return bsArray.list.map((bs) => bs.bytes).join("");
};

/**
 * The utility function to create a Plutus Data association map in JSON
 * @param mapItems The items map in array
 * @param validation Default true - If current data construction would perform validation (introducing this flag due to possible performance issue in loop validation)
 * @returns The Plutus Data association map object
 */
export const assocMap = <K, V>(
  mapItems: [K, V][],
  validation = true,
): AssocMap<K, V> => ({
  map: mapItems.map(([k, v]) => {
    if (validation) {
      if (typeof k !== "object" || typeof v !== "object") {
        throw new Error(
          `Map item of JSON Cardano data type must be an object - ${k}, ${v}`,
        );
      }
    }
    return { k, v };
  }),
});
