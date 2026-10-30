import type { AssetsPrototype } from "@meshsdk/common";

import {
  fail,
  freeze,
  isHash28,
  isHex,
  labelOf,
  PartContext,
  toNativeScriptSource,
  toPlutusScriptSource,
  toRedeemer,
} from "./normalize";
import {
  MintAssetsInput,
  MintPart,
  NativeScriptInput,
  NativeScriptSource,
  PlutusScriptInput,
  PlutusScriptSource,
  RedeemerInput,
} from "./types";

/** Mint quantities are `int64` */
const MAX_INT64 = 2n ** 63n - 1n;
const MIN_INT64 = -(2n ** 63n);

const toMintAssets = (
  ctx: PartContext,
  assets: MintAssetsInput,
): AssetsPrototype => {
  const entries = Object.entries(assets);
  if (entries.length === 0) fail(ctx, "INVALID_VALUE", "no assets to mint");
  const result: AssetsPrototype = {};
  for (const [rawName, quantity] of entries) {
    const assetName = rawName.toLowerCase();
    if (!isHex(assetName) || assetName.length > 64)
      fail(ctx, "INVALID_VALUE", `invalid asset name ${rawName}`);
    if (
      typeof quantity !== "bigint" ||
      quantity === 0n ||
      quantity > MAX_INT64 ||
      quantity < MIN_INT64
    )
      fail(ctx, "INVALID_VALUE", `invalid quantity ${quantity} of ${rawName}`);
    if (assetName in result)
      fail(ctx, "INVALID_VALUE", `asset name ${rawName} given twice`);
    result[assetName] = quantity.toString();
  }
  return result;
};

/**
 * The policy id is the script's hash. A script referenced by out ref alone has no known hash,
 * so the policy id must then be given; whatever is known must agree.
 */
const toPolicyId = <T extends PlutusScriptSource | NativeScriptSource>(
  ctx: PartContext,
  script: T,
  policyId: string | undefined,
): { policyId: string; script: T } => {
  const given = policyId?.toLowerCase();
  if (given !== undefined && !isHash28(given))
    fail(ctx, "INVALID_SCRIPT", `invalid policy id ${policyId}`);
  if (given && script.scriptHash && given !== script.scriptHash)
    fail(
      ctx,
      "INVALID_SCRIPT",
      `policy id ${given} does not match the script's hash ${script.scriptHash}`,
    );
  const resolved = given ?? script.scriptHash;
  if (!resolved)
    return fail(
      ctx,
      "INVALID_SCRIPT",
      "the policy id is unknown: pass policyId, or the reference UTxO in full",
    );
  return {
    policyId: resolved,
    script: script.scriptHash ? script : { ...script, scriptHash: resolved },
  };
};

export const mint = {
  /**
   * Mint or burn tokens under a native script policy.
   * @param params.script The policy script: attached as a `NativeScript` or its CBOR, or held
   *   in a reference output (`{ reference }`)
   * @param params.assets Quantities by asset name in hex; negative to burn
   * @param params.policyId Needed only for a script referenced by out ref alone
   * @param params.label Name echoed in errors about this part
   */
  native: (params: {
    script: NativeScriptInput;
    assets: MintAssetsInput;
    policyId?: string;
    label?: string;
  }): MintPart => {
    const ctx: PartContext = { part: "mint", label: params.label };
    const { policyId, script } = toPolicyId(
      ctx,
      toNativeScriptSource(ctx, params.script),
      params.policyId,
    );
    return freeze({
      kind: "mint",
      policyId,
      assets: toMintAssets(ctx, params.assets),
      witness: { type: "native", script },
      ...labelOf(params.label),
    });
  },

  /**
   * Mint or burn tokens under a Plutus script policy.
   * @param params.script The policy script: attached (`{ code, version }`) or held in a
   *   reference output (`{ reference }`)
   * @param params.redeemer Redeemer data, with execution units if already known
   * @param params.assets Quantities by asset name in hex; negative to burn
   * @param params.policyId Needed only for a script referenced by out ref alone
   * @param params.label Name echoed in errors about this part, such as a script failure
   */
  plutus: (params: {
    script: PlutusScriptInput;
    redeemer: RedeemerInput;
    assets: MintAssetsInput;
    policyId?: string;
    label?: string;
  }): MintPart => {
    const ctx: PartContext = { part: "mint", label: params.label };
    const { policyId, script } = toPolicyId(
      ctx,
      toPlutusScriptSource(ctx, params.script),
      params.policyId,
    );
    return freeze({
      kind: "mint",
      policyId,
      assets: toMintAssets(ctx, params.assets),
      witness: {
        type: "plutus",
        script,
        redeemer: toRedeemer(ctx, params.redeemer),
      },
      ...labelOf(params.label),
    });
  },
};
