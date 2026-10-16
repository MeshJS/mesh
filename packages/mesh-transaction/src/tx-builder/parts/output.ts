import type {
  AssetsPrototype,
  DataOptionPrototype,
  MultiAssetPrototype,
  NativeScript,
  PlutusDataVariant,
  PlutusScript,
} from "@meshsdk/common";
import { toScriptRef } from "@meshsdk/core-cst";

import {
  errorText,
  fail,
  freeze,
  isHash28,
  isHash32,
  isHex,
  labelOf,
  parseAddress,
  PartContext,
  toPlutusData,
} from "./normalize";
import { OutputDatumInput, OutputPart, ValueInput } from "./types";

/** Asset names are at most 32 bytes */
const MAX_ASSET_NAME_HEX = 64;

const toValue = (ctx: PartContext, value: ValueInput) => {
  const entries: [string, bigint][] = Array.isArray(value)
    ? value.map(({ unit, quantity }) => {
        if (typeof quantity !== "string" || !/^\d+$/.test(quantity))
          fail(ctx, "INVALID_VALUE", `invalid quantity ${quantity} of ${unit}`);
        return [unit, BigInt(quantity)];
      })
    : Object.entries(value);

  let coin: bigint | undefined;
  const multiasset: MultiAssetPrototype = {};
  for (const [rawUnit, quantity] of entries) {
    if (typeof quantity !== "bigint" || quantity <= 0n)
      fail(ctx, "INVALID_VALUE", `invalid quantity ${quantity} of ${rawUnit}`);
    if (rawUnit === "lovelace" || rawUnit === "") {
      coin = (coin ?? 0n) + quantity;
      continue;
    }
    const unit = rawUnit.toLowerCase();
    const policyId = unit.slice(0, 56);
    const assetName = unit.slice(56);
    if (
      !isHash28(policyId) ||
      !isHex(assetName) ||
      assetName.length > MAX_ASSET_NAME_HEX
    )
      fail(ctx, "INVALID_VALUE", `invalid asset unit ${rawUnit}`);
    const assets: AssetsPrototype = (multiasset[policyId] ??= {});
    assets[assetName] = (BigInt(assets[assetName] ?? 0) + quantity).toString();
  }

  return {
    ...(coin !== undefined && { coin: coin.toString() }),
    ...(Object.keys(multiasset).length > 0 && { multiasset }),
  };
};

const toDatum = (
  ctx: PartContext,
  datum: OutputDatumInput,
): { plutus_data: DataOptionPrototype; embeddedDatum?: PlutusDataVariant } => {
  if (datum.type === "inline")
    return {
      plutus_data: { type: "DATA", value: toPlutusData(ctx, datum.data).data },
    };
  if ("hash" in datum) {
    const hash =
      typeof datum.hash === "string" ? datum.hash.toLowerCase() : datum.hash;
    if (typeof hash !== "string" || !isHash32(hash))
      fail(ctx, "INVALID_DATA", `invalid datum hash ${datum.hash}`);
    return { plutus_data: { type: "DATA_HASH", value: hash } };
  }
  const { data, hash } = toPlutusData(ctx, datum.data);
  return {
    plutus_data: { type: "DATA_HASH", value: hash },
    ...(datum.embed && { embeddedDatum: data }),
  };
};

const toScriptReference = (
  ctx: PartContext,
  script: PlutusScript | NativeScript,
): string => {
  try {
    return toScriptRef(script).toCbor().toString();
  } catch (error) {
    return fail(
      ctx,
      "INVALID_SCRIPT",
      `invalid reference script: ${errorText(error)}`,
    );
  }
};

/**
 * Create an output.
 * @param params.address The address receiving the output
 * @param params.value Lovelace and assets; without lovelace, the output holds the minimum it
 *   needs
 * @param params.datum A datum held inline, or as a hash
 * @param params.scriptRef A Plutus or native script made available as a reference script
 * @param params.label Name echoed in errors about this part
 */
export const output = (params: {
  address: string;
  value: ValueInput;
  datum?: OutputDatumInput;
  scriptRef?: PlutusScript | NativeScript;
  label?: string;
}): OutputPart => {
  const ctx: PartContext = { part: "output", label: params.label };
  parseAddress(ctx, params.address);
  const datum = params.datum && toDatum(ctx, params.datum);
  return freeze({
    kind: "output",
    output: {
      address: params.address,
      amount: toValue(ctx, params.value),
      ...(datum && { plutus_data: datum.plutus_data }),
      ...(params.scriptRef && {
        script_ref: toScriptReference(ctx, params.scriptRef),
      }),
    },
    ...(datum?.embeddedDatum && { embeddedDatum: datum.embeddedDatum }),
    ...labelOf(params.label),
  });
};
