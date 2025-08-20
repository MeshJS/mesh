import { Asset } from "@meshsdk/common";

export type hydraAssets = {
  lovelace: number;
} & {
  [assets: string]: number;
};

export function hydraAssets(assets: Asset[]): hydraAssets {
  return assets.reduce(
    (p, asset) => {
      if (asset.unit === "" || asset.unit === "lovelace") {
        p.lovelace += Number(asset.quantity);
      } else {
        p[asset.unit] = (p[asset.unit] ?? 0) + Number(asset.quantity);
      }
      return p;
    },
    { lovelace: Number(0) } as hydraAssets
  );
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
