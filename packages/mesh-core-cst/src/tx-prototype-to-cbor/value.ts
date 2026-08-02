import type {
  Asset,
  MultiAssetPrototype,
  ValuePrototype,
} from "@meshsdk/common";

import { Value } from "../types";
import { toValue } from "../utils";

/** `MultiAssetPrototype` is `{ [policyId]: { [assetNameHex]: quantity } }`; flatten it into the
 * `unit = policyId + assetNameHex` shape `toValue` (Mesh's own CST value builder) expects. */
export const multiAssetPrototypeToAssets = (
  coin: string,
  multiasset: MultiAssetPrototype | null | undefined,
): Asset[] => {
  const assets: Asset[] = [{ unit: "lovelace", quantity: coin }];
  if (multiasset) {
    for (const [policyId, tokens] of Object.entries(multiasset)) {
      for (const [assetNameHex, quantity] of Object.entries(tokens)) {
        assets.push({ unit: `${policyId}${assetNameHex}`, quantity });
      }
    }
  }
  return assets;
};

export const valuePrototypeToCardano = (value: ValuePrototype): Value =>
  toValue(multiAssetPrototypeToAssets(value.coin, value.multiasset));
