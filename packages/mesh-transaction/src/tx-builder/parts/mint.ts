import type { AssetsPrototype } from "@meshsdk/common";

import {
  fail,
  freeze,
  isHash28,
  isHex,
  labelOf,
  partContext,
  PartContext,
  toNativeScriptSource,
  toPlutusScriptSource,
  toRedeemer,
} from "./normalize";
import { shownValue } from "./shape";
import {
  MintAssetsInput,
  MintPart,
  NativeScriptInput,
  NativeScriptSource,
  PartParams,
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
  if (typeof assets !== "object" || assets === null)
    fail(ctx, "INVALID_VALUE", `invalid assets ${shownValue(assets)}`);
  const entries = Object.entries(assets);
  if (entries.length === 0) fail(ctx, "INVALID_VALUE", "no assets to mint");
  const result: AssetsPrototype = {};
  for (const [rawName, quantity] of entries) {
    const assetName = rawName.toLowerCase();
    if (!isHex(assetName) || assetName.length > 64)
      fail(
        ctx,
        "INVALID_VALUE",
        `invalid asset name: expected hex of at most 32 bytes; got ${shownValue(rawName)}`,
      );
    if (
      typeof quantity !== "bigint" ||
      quantity === 0n ||
      quantity > MAX_INT64 ||
      quantity < MIN_INT64
    )
      fail(
        ctx,
        "INVALID_VALUE",
        `invalid quantity ${shownValue(quantity)} of ${rawName}`,
      );
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
    fail(
      ctx,
      "INVALID_SCRIPT",
      `invalid policy id: expected a 28-byte script hash in hex; got ${shownValue(policyId)}`,
    );
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

/** What `mint.native` takes */
export interface MintNativeParams extends PartParams {
  /**
   * The policy script: attached as a `NativeScript` or its CBOR, or held in a reference
   * output (`{ reference }`)
   */
  script: NativeScriptInput;
  /** Quantities by asset name in hex; negative to burn */
  assets: MintAssetsInput;
  /** Needed only for a script referenced by out ref alone */
  policyId?: string;
}

/** What `mint.plutus` takes */
export interface MintPlutusParams extends PartParams {
  /**
   * The policy script: attached (`{ code, version }`, the code flat or in one or two CBOR
   * wrappings) or held in a reference output (`{ reference }`)
   */
  script: PlutusScriptInput;
  /**
   * Data, or a function of the final transaction (`self`: this policy's index among the
   * policies), with execution units if already known
   */
  redeemer: RedeemerInput;
  /** Quantities by asset name in hex; negative to burn */
  assets: MintAssetsInput;
  /** Needed only for a script referenced by out ref alone */
  policyId?: string;
}

export const mint = {
  /** Mint or burn tokens under a native script policy. */
  native: (params: MintNativeParams): MintPart => {
    const ctx = partContext("mint", params);
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

  /** Mint or burn tokens under a Plutus script policy. */
  plutus: (params: MintPlutusParams): MintPart => {
    const ctx = partContext("mint", params);
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
