import { HexBlob } from "@cardano-sdk/util";

export const bytesToHex = (bytes: Uint8Array): HexBlob =>
  Buffer.from(bytes).toString("hex") as HexBlob;

export const hexToBytes = (hex: HexBlob): Uint8Array => Buffer.from(hex, "hex");

export const utf8ToBytes = (str: string): Uint8Array =>
  Buffer.from(str, "utf8");

export const utf8ToHex = (str: string): HexBlob =>
  Buffer.from(str, "utf8").toString("hex") as HexBlob;
