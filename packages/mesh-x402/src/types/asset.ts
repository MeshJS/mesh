export const LOVELACE = "lovelace";

export type ParsedAsset = "lovelace" | { policyId: string; assetNameHex: string };

/** Parses an x402 Cardano asset string: `"lovelace"` or `"policyId.assetNameHex"`. */
export const parseAssetUnit = (asset: string): ParsedAsset => {
  if (asset === LOVELACE) return LOVELACE;

  const [policyId, ...rest] = asset.split(".");
  const assetNameHex = rest.join(".");
  if (!policyId || policyId.length !== 56 || !/^[0-9a-fA-F]*$/.test(assetNameHex)) {
    throw new Error(
      `Invalid x402 asset string "${asset}" - expected "lovelace" or "policyId.assetNameHex"`,
    );
  }
  return { policyId: policyId.toLowerCase(), assetNameHex: assetNameHex.toLowerCase() };
};

/** Converts an x402 asset string to Mesh's `Asset.unit` form (concatenated, no separator). */
export const toMeshUnit = (asset: string): string => {
  const parsed = parseAssetUnit(asset);
  return parsed === LOVELACE ? LOVELACE : `${parsed.policyId}${parsed.assetNameHex}`;
};

/** Converts a Mesh `Asset.unit` string back to the x402 `"policyId.assetNameHex"` form. */
export const fromMeshUnit = (unit: string): string => {
  if (unit === LOVELACE || unit === "") return LOVELACE;
  const policyId = unit.slice(0, 56);
  const assetNameHex = unit.slice(56);
  return `${policyId}.${assetNameHex}`;
};

/** Compares two x402 asset strings for equality, normalizing case and lovelace's empty-suffix form. */
export const assetsEqual = (a: string, b: string): boolean => toMeshUnit(a) === toMeshUnit(b);
