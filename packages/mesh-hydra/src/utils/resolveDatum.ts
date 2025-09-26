import { parseDatumCbor } from "@meshsdk/core-cst";

export async function resolvePlutusData(datumHash: string) {
  const data = parseDatumCbor(datumHash);

  function normalize(value: any): any {
    if (typeof value === "bigint") {
      return value <= Number.MAX_SAFE_INTEGER &&
        value >= Number.MIN_SAFE_INTEGER
        ? Number(value)
        : value.toString();
    }
    if (Array.isArray(value)) {
      return value.map(normalize);
    }
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, normalize(v)])
      );
    }
    return value;
  }

  return { inlineDatum: normalize(data) };
}
