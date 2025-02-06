import { HexBlob } from "@cardano-sdk/util";
import base32 from "base32-encoding";
import { bech32 } from "bech32";

export const bytesToHex = (bytes: Uint8Array): HexBlob =>
  Buffer.from(bytes).toString("hex") as HexBlob;

export const hexToBytes = (hex: HexBlob): Uint8Array => Buffer.from(hex, "hex");

export const utf8ToBytes = (str: string): Uint8Array =>
  Buffer.from(str, "utf8");

export const utf8ToHex = (str: string): HexBlob =>
  Buffer.from(str, "utf8").toString("hex") as HexBlob;

export const hexToBech32 = (prefix: string, hex: string): string => {
  const buf = Buffer.from(hex, "hex");
  const base32RawBytes = base32.encode(buf);
  return bech32.encode(prefix, base32RawBytes);
};
