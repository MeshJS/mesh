import { Asset } from "@meshsdk/common";

export type hydraAssets = {
  lovelace: bigint;
} & {
  [assets: string]: bigint;
};

export function hydraAssets(assets: Asset[]): hydraAssets {
  return assets.reduce(
    (p, asset) => {
      if (asset.unit === "" || asset.unit === "lovelace") {
        p.lovelace += BigInt(asset.quantity);
      } else {
        p[asset.unit] = (p[asset.unit] ?? 0n) + BigInt(asset.quantity);
      }
      return p;
    },
    { lovelace: BigInt(0n) } as hydraAssets
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
