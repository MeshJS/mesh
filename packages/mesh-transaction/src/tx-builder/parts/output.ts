import type {
  AssetsPrototype,
  DataOptionPrototype,
  MultiAssetPrototype,
  NativeScript,
  PlutusDataVariant,
  PlutusScript,
} from "@meshsdk/common";
import { toScriptRef } from "@meshsdk/core-cst";

import type { PartContext } from "./normalize";
import type { OutputDatumInput, OutputPart, ValueInput } from "./types";
import {
  addressText,
  errorText,
  fail,
  freeze,
  isHash28,
  isHash32,
  isHex,
  labelOf,
  parseAddress,
  partContext,
  toPlutusData,
  toPlutusScriptCode,
} from "./normalize";
import { isOneItem } from "./utxo";

/** Asset names are at most 32 bytes */
const MAX_ASSET_NAME_HEX = 64;

const toValue = (ctx: PartContext, value: ValueInput) => {
  if (typeof value !== "object" || value === null)
    fail(
      ctx,
      "INVALID_VALUE",
      `invalid value ${String(value)}: expected a list of assets or { unit: quantity }`,
    );
  const entries: [string, bigint][] = Array.isArray(value)
    ? value.map((asset: unknown) => {
        if (typeof asset !== "object" || asset === null)
          fail(ctx, "INVALID_VALUE", `invalid asset ${String(asset)}`);
        const { unit, quantity } = asset as {
          unit: unknown;
          quantity: unknown;
        };
        if (typeof quantity !== "string" || !/^\d+$/.test(quantity))
          fail(
            ctx,
            "INVALID_VALUE",
            `invalid quantity ${String(quantity)} of ${String(unit)}`,
          );
        return [unit as string, BigInt(quantity as string)];
      })
    : Object.entries(value);

  let coin: bigint | undefined;
  const multiasset: MultiAssetPrototype = {};
  for (const [rawUnit, quantity] of entries) {
    if (typeof quantity !== "bigint" || quantity <= 0n)
      fail(ctx, "INVALID_VALUE", `invalid quantity ${quantity} of ${rawUnit}`);
    if (typeof rawUnit !== "string")
      fail(ctx, "INVALID_VALUE", `invalid asset unit ${String(rawUnit)}`);
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
  if (typeof datum !== "object" || datum === null)
    fail(
      ctx,
      "INVALID_DATA",
      `invalid datum ${String(datum)}: expected { type: "inline" | "hash", ... }`,
    );
  if (datum.type === "inline") {
    const { data } = toPlutusData(ctx, datum.data);
    // The output's UTxO holds these bytes: they are read back as one item of data
    if (data.type === "CBOR" && !isOneItem(data.hex))
      fail(
        ctx,
        "INVALID_DATA",
        `invalid inline datum ${data.hex}: bytes follow the Plutus data`,
      );
    return { plutus_data: { type: "DATA", value: data } };
  }
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
  const what = "invalid reference script";
  const normalised =
    "code" in script
      ? { ...script, code: toPlutusScriptCode(ctx, script.code, what) }
      : script;
  try {
    return toScriptRef(normalised).toCbor().toString();
  } catch (error) {
    return fail(ctx, "INVALID_SCRIPT", `${what}: ${errorText(error)}`, error);
  }
};

/**
 * Create an output.
 * @param params.address The address receiving the output, in bech32, base58 (Byron) or hex
 * @param params.value Lovelace and assets; without lovelace, the output holds the minimum it
 *   needs
 * @param params.datum A datum held inline, or as a hash; an inline datum given as CBOR is one
 *   item of Plutus data, with no bytes after it
 * @param params.scriptRef A Plutus or native script made available as a reference script; a
 *   Plutus script's code flat or in one or two CBOR wrappings
 * @param params.label Name echoed in errors about this part
 */
export const output = (params: {
  address: string;
  value: ValueInput;
  datum?: OutputDatumInput;
  scriptRef?: PlutusScript | NativeScript;
  label?: string;
}): OutputPart => {
  const ctx = partContext("output", params);
  const address = parseAddress(ctx, params.address);
  if (address.asReward())
    fail(
      ctx,
      "INVALID_ADDRESS",
      `reward address ${params.address} cannot receive transaction outputs`,
    );
  const datum = params.datum && toDatum(ctx, params.datum);
  return freeze({
    kind: "output",
    output: {
      address: addressText(address),
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
