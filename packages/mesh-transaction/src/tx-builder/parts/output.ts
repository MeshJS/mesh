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
import { shownValue } from "./shape";
import { isOneItem } from "./utxo";

/** The largest quantity of a unit one output holds */
const MAX_QUANTITY = 2n ** 64n - 1n;

/** Asset names are at most 32 bytes */
const MAX_ASSET_NAME_HEX = 64;

/**
 * An asset unit for an error about its quantity: as given when it reads as one, else by its
 * shape, as it may be a key given by mistake
 */
const unitShown = (unit: unknown): string =>
  typeof unit === "string" &&
  (unit === "lovelace" ||
    unit === "" ||
    (isHash28(unit.slice(0, 56).toLowerCase()) &&
      isHex(unit.slice(56).toLowerCase()) &&
      unit.length <= 56 + MAX_ASSET_NAME_HEX))
    ? unit
    : shownValue(unit);

const toValue = (ctx: PartContext, value: ValueInput) => {
  if (typeof value !== "object" || value === null)
    fail(
      ctx,
      "INVALID_VALUE",
      `invalid value ${shownValue(value)}: expected a list of assets or { unit: quantity }`,
    );
  const entries: [string, bigint][] = Array.isArray(value)
    ? value.map((asset: unknown) => {
        if (typeof asset !== "object" || asset === null)
          fail(ctx, "INVALID_VALUE", `invalid asset ${shownValue(asset)}`);
        const { unit, quantity } = asset as {
          unit: unknown;
          quantity: unknown;
        };
        if (typeof quantity !== "string" || !/^\d+$/.test(quantity))
          fail(
            ctx,
            "INVALID_VALUE",
            `invalid quantity ${shownValue(quantity)} of ${unitShown(unit)}`,
          );
        return [unit as string, BigInt(quantity as string)];
      })
    : Object.entries(value);

  let coin: bigint | undefined;
  const multiasset: MultiAssetPrototype = {};
  /** A quantity a transaction holds: one output's quantity of a unit is at most 2^64 - 1 */
  const bounded = (quantity: bigint, unit: unknown) => {
    if (quantity > MAX_QUANTITY)
      fail(
        ctx,
        "INVALID_VALUE",
        `the quantity of ${unitShown(unit)} is ${quantity}, more than an output can hold (${MAX_QUANTITY})`,
      );
    return quantity;
  };
  for (const [rawUnit, quantity] of entries) {
    if (typeof quantity !== "bigint" || quantity <= 0n)
      fail(
        ctx,
        "INVALID_VALUE",
        `invalid quantity ${shownValue(quantity)} of ${unitShown(rawUnit)}`,
      );
    if (typeof rawUnit !== "string")
      fail(ctx, "INVALID_VALUE", `invalid asset unit ${shownValue(rawUnit)}`);
    if (rawUnit === "lovelace" || rawUnit === "") {
      coin = bounded((coin ?? 0n) + quantity, rawUnit);
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
      fail(
        ctx,
        "INVALID_VALUE",
        `invalid asset unit: expected lovelace or a policy id and an asset name in hex; got ${shownValue(rawUnit)}`,
      );
    const assets: AssetsPrototype = (multiasset[policyId] ??= {});
    assets[assetName] = bounded(
      BigInt(assets[assetName] ?? 0) + quantity,
      rawUnit,
    ).toString();
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
      `invalid datum ${shownValue(datum)}: expected { type: "inline" | "hash", ... }`,
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
      fail(
        ctx,
        "INVALID_DATA",
        `invalid datum hash: expected a 32-byte hash in hex; got ${shownValue(datum.hash)}`,
      );
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
