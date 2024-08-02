import { POLICY_ID_LENGTH } from "../constants";

/**
 * Converting bytes to hex string
 * @param bytes The bytes to be converted
 * @returns The hex string
 */
export const bytesToHex = (bytes: ArrayBuffer): string =>
  Buffer.from(bytes).toString("hex");

/**
 * Converting hex string to bytes
 * @param hex The hex string to be converted
 * @returns The bytes
 */
export const hexToBytes = (hex: string) => Buffer.from(hex, "hex");

/**
 * Converting utf8 string to hex string
 * @param str The utf8 string to be converted
 * @returns The hex string
 */
export const stringToHex = (str: string) =>
  Buffer.from(str, "utf8").toString("hex");

/**
 * Converting hex string to utf8 string
 * @param hex The hex string to be converted
 * @returns The utf8 string
 */
export const hexToString = (hex: string) =>
  Buffer.from(hex, "hex").toString("utf8");

/**
 * Converting either hex string or utf8 string to bytes
 * @param hex The hex or utf8 string to be converted
 * @returns The bytes
 */
export const toBytes = (hex: string): Uint8Array => {
  if (hex.length % 2 === 0 && /^[0-9A-F]*$/i.test(hex))
    return Buffer.from(hex, "hex");

  return Buffer.from(hex, "utf-8");
};

/**
 * Converting utf8 string to hex string
 * @param utf8 The utf8 string to be converted
 * @returns The hex string
 */
export const fromUTF8 = (utf8: string) => {
  if (utf8.length % 2 === 0 && /^[0-9A-F]*$/i.test(utf8)) return utf8;
  return bytesToHex(Buffer.from(utf8, "utf-8"));
};

/**
 * Converting hex string to utf8 string
 * @param hex The hex string to be converted
 * @returns The utf8 string
 */
export const toUTF8 = (hex: string) =>
  Buffer.from(hex, "hex").toString("utf-8");

/**
 * Parse asset unit into an object with policyId and assetName
 * @param unit The asset unit to be parsed
 * @returns The object with policyId and assetName
 */
export const parseAssetUnit = (unit: string) => {
  const policyId = unit.slice(0, POLICY_ID_LENGTH);
  const assetName = unit.includes(".")
    ? fromUTF8(unit.split(".")[1] as string)
    : unit.slice(POLICY_ID_LENGTH);

  return { policyId, assetName };
};
