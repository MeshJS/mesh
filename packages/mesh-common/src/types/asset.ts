export type Asset = {
  unit: Unit;
  quantity: Quantity;
};

export type Unit = string;

export type Quantity = string;

export const mergeAssets = (assets: Asset[]): Asset[] => {
  const merged: Asset[] = [];
  assets.forEach((asset) => {
    const existing = merged.find((a) => a.unit === asset.unit);
    if (existing) {
      existing.quantity = (
        BigInt(existing.quantity) + BigInt(asset.quantity)
      ).toString();
    } else {
      merged.push(asset);
    }
  });
  return merged;
};
