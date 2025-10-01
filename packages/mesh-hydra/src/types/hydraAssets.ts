import { Asset } from "@meshsdk/common";

export type HydraAssets = {
  lovelace: number;
} & {
  [policyId: string]: {
    [assetNameHex: string]: number;
  };
};

export function hydraAssets(assets: Asset[]): HydraAssets {
  return assets.reduce(
    (acc, asset) => {
      if (asset.unit === "" || asset.unit === "lovelace") {
        acc.lovelace += Number(asset.quantity);
      } else {
        const policyId = asset.unit.slice(0, 56);
        const assetNameHex = asset.unit.slice(56) || "";

        if (!acc[policyId]) acc[policyId] = {};
        acc[policyId][assetNameHex] =
          (acc[policyId][assetNameHex] ?? 0) + Number(asset.quantity);
      }
      return acc;
    },
    { lovelace: 0 } as HydraAssets
  );
}

hydraAssets.toAssets = (assetsObj: HydraAssets): Asset[] => {
  const newAssets: Asset[] = [];

  if (assetsObj.lovelace && assetsObj.lovelace > 0) {
    newAssets.push({
      unit: "lovelace",
      quantity: assetsObj.lovelace.toString(),
    });
  }

  for (const [policyId, assets] of Object.entries(assetsObj)) {
    if (policyId === "lovelace") continue;
    for (const [assetNameHex, quantity] of Object.entries(assets)) {
      newAssets.push({
        unit: `${policyId}${assetNameHex}`,
        quantity: quantity.toString(),
      });
    }
  }

  return newAssets;
};
