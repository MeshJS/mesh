import { Asset } from "@meshsdk/common";

export type hAssets = {
  lovelace: bigint;
} & {
  [policyId: string]: {
    [assetName: string]: bigint;
  };
};

export function hAssets(assets: Asset[]): hAssets {
  return assets.reduce((p, asset) => {
      if (asset.unit === "" || asset.unit === "lovelace") {
        p["lovelace"] += BigInt(asset.quantity);
      } else {
        const policyId = asset.unit.slice(0, 56);
        const assetName = asset.unit.slice(56);
        if (!p[policyId]) p[policyId] = {};
        p[policyId][assetName] = (p[policyId][assetName] ?? BigInt(0)) + BigInt(asset.quantity);
      }
      return p;
    }, { lovelace: BigInt(0) } as hAssets
  );
}

hAssets.toAssets = (hAssets: hAssets): Asset[] => {
  const assets: Asset[] = [];
  for (const policy of Object.keys(hAssets)) {
    if (policy === "lovelace") {
      assets.push({
        unit: policy,
        quantity: hAssets[policy].toString(),
      });
    } else {
      for (const assetName of Object.keys(hAssets[policy]!)) {
        assets.push({
          unit: policy + assetName,
          quantity: hAssets[policy]![assetName]!.toString(),
        });
      }
    }
  }
  return assets;
}
