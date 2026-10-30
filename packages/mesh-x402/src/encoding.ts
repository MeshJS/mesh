const toBase64 = (value: string): string =>
  typeof Buffer !== "undefined"
    ? Buffer.from(value, "utf-8").toString("base64")
    : btoa(value);

export const fromBase64 = (value: string): string =>
  typeof Buffer !== "undefined"
    ? Buffer.from(value, "base64").toString("utf-8")
    : atob(value);

export const base64ToHex = (base64: string): string =>
  Buffer.from(base64, "base64").toString("hex");

export const hexToBase64 = (hex: string): string =>
  Buffer.from(hex, "hex").toString("base64");

/** Header form shared by `PAYMENT-SIGNATURE` and `PAYMENT-RESPONSE`: base64 of the JSON value. */
export const encodeHeaderJson = (value: unknown): string =>
  toBase64(JSON.stringify(value));

export const decodeHeaderJson = <T>(header: string): T =>
  JSON.parse(fromBase64(header)) as T;
