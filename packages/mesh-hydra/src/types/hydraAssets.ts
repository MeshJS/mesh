import { Asset } from "@meshsdk/common";

export type hydraAssets = {
  lovelace: number;
} & {
  [assets: string]: number;
};

export function hydraAssets(assets: Asset[]): hydraAssets {
  return assets.reduce((p, asset) => {
    if (asset.unit === "" || asset.unit === "lovelace") {
      p.lovelace = (p.lovelace ?? 0) + Number(asset.quantity);
    } else {
      const policyId = asset.unit.slice(0, 56);
      const assetName = asset.unit.slice(56);
      if (!p[policyId]) {
        p[policyId] = {};
      }
      p[policyId][assetName.toString()] = (p[policyId][assetName.toString()] ?? 0) + Number(asset.quantity);
    }
    return p;
  }, { lovelace: 0 } as any);
}

hydraAssets.toAssets = (hydraAssets: hydraAssets): Asset[] => {
  const assets: Asset[] = [];
  for (const unit of Object.keys(hydraAssets)) {
    if (unit === "lovelace") {
      assets.push({
        unit: unit,
        quantity: hydraAssets[unit].toString(),
      });
    }
  }
  return assets;
};
