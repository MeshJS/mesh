import type { LanguageVersion, UTxO } from "@meshsdk/common";

import type { PartContext } from "./normalize";
import type {
  CollateralPart,
  CollateralReturnPart,
  InputRef,
  NativeScriptInput,
  PlutusScriptInput,
  RedeemerInput,
  ReferenceInputPart,
  SpendDatum,
  SpendDatumInput,
  SpendPart,
} from "./types";
import {
  fail,
  freeze,
  labelOf,
  parseAddress,
  paymentCredential,
  toExUnits,
  toNativeScriptSource,
  toPlutusData,
  toPlutusScriptSource,
  toResolvableInput,
} from "./normalize";

/**
 * Checks that a known output is locked the way its witness expects: by a key, or by the script
 * with the given hash (when the hash is known).
 */
const checkLock = (
  ctx: PartContext,
  utxo: UTxO | undefined,
  expected: { type: "key" } | { type: "script"; hash?: string },
) => {
  if (!utxo) return;
  const credential = paymentCredential(parseAddress(ctx, utxo.output.address));
  const outRef = `${utxo.input.txHash}#${utxo.input.outputIndex}`;
  // Byron addresses carry no payment credential and are always key-locked
  const locked = credential ?? { type: "key" as const, hash: undefined };
  if (expected.type === "key" && locked.type === "script")
    fail(
      ctx,
      "WITNESS_MISMATCH",
      `${outRef} is locked by script ${locked.hash}, not by a key`,
    );
  if (expected.type === "script") {
    if (locked.type === "key")
      fail(
        ctx,
        "WITNESS_MISMATCH",
        `${outRef} is locked by a key, not a script`,
      );
    if (expected.hash !== undefined && expected.hash !== locked.hash)
      fail(
        ctx,
        "WITNESS_MISMATCH",
        `${outRef} is locked by script ${locked.hash}, not by ${expected.hash}`,
      );
  }
};

/**
 * Works out the datum of a spent script output, checking an explicit choice against the
 * output when it is known.
 */
const toSpendDatum = (
  ctx: PartContext,
  datum: SpendDatumInput | undefined,
  utxo: UTxO | undefined,
  version: LanguageVersion | undefined,
): SpendDatum | undefined => {
  const outRef = utxo && `${utxo.input.txHash}#${utxo.input.outputIndex}`;
  const inlineDatum = utxo?.output.plutusData;
  const datumHash = utxo?.output.dataHash;
  const requireV3 = () => {
    if (version !== undefined && version !== "V3")
      fail(
        ctx,
        "DATUM_MISMATCH",
        `a Plutus ${version} script cannot spend an output holding no datum`,
      );
  };

  if (datum === "inline") {
    if (utxo && !inlineDatum)
      fail(ctx, "DATUM_MISMATCH", `${outRef} holds no inline datum`);
    return { type: "inline" };
  }
  if (datum === "none") {
    requireV3();
    if (inlineDatum || datumHash)
      fail(ctx, "DATUM_MISMATCH", `${outRef} holds a datum`);
    return { type: "none" };
  }
  if (datum !== undefined) {
    const provided = toPlutusData(ctx, datum.data);
    if (utxo) {
      if (inlineDatum)
        fail(
          ctx,
          "DATUM_MISMATCH",
          `${outRef} holds its datum inline; spend it with datum "inline"`,
        );
      if (!datumHash)
        fail(ctx, "DATUM_MISMATCH", `${outRef} holds no datum hash`);
      if (datumHash !== provided.hash)
        fail(
          ctx,
          "DATUM_MISMATCH",
          `${outRef} holds datum hash ${datumHash}, not the given datum's ${provided.hash}`,
        );
    }
    return { type: "provided", ...provided };
  }

  if (!utxo) return undefined;
  if (inlineDatum) return { type: "inline" };
  if (datumHash)
    return fail(
      ctx,
      "DATUM_MISMATCH",
      `${outRef} holds datum hash ${datumHash}; pass the datum as { data }`,
    );
  requireV3();
  return { type: "none" };
};

export const spend = {
  /**
   * Spend an output locked by a payment key.
   * @param params.utxo The output, by reference or in full
   * @param params.label Name echoed in errors about this part
   */
  pubKey: (params: { utxo: InputRef; label?: string }): SpendPart => {
    const ctx: PartContext = { part: "spend", label: params.label };
    const resolvable = toResolvableInput(ctx, params.utxo);
    checkLock(ctx, resolvable.utxo, { type: "key" });
    return freeze({
      kind: "spend",
      ...resolvable,
      witness: { type: "key" },
      ...labelOf(params.label),
    });
  },

  /**
   * Spend an output locked by a native script.
   * @param params.utxo The output, by reference or in full
   * @param params.script The script: attached as a `NativeScript` or its CBOR, or held in a
   *   reference output (`{ reference }`)
   * @param params.label Name echoed in errors about this part
   */
  native: (params: {
    utxo: InputRef;
    script: NativeScriptInput;
    label?: string;
  }): SpendPart => {
    const ctx: PartContext = { part: "spend", label: params.label };
    const resolvable = toResolvableInput(ctx, params.utxo);
    const script = toNativeScriptSource(ctx, params.script);
    checkLock(ctx, resolvable.utxo, {
      type: "script",
      hash: script.scriptHash,
    });
    return freeze({
      kind: "spend",
      ...resolvable,
      witness: { type: "native", script },
      ...labelOf(params.label),
    });
  },

  /**
   * Spend an output locked by a Plutus script.
   * @param params.utxo The output, by reference or in full
   * @param params.script The script: attached (`{ code, version }`) or held in a reference
   *   output (`{ reference }`)
   * @param params.redeemer Redeemer data, with execution units if already known
   * @param params.datum The datum of the output; worked out from the output when omitted
   * @param params.label Name echoed in errors about this part, such as a script failure
   */
  plutus: (params: {
    utxo: InputRef;
    script: PlutusScriptInput;
    redeemer: RedeemerInput;
    datum?: SpendDatumInput;
    label?: string;
  }): SpendPart => {
    const ctx: PartContext = { part: "spend", label: params.label };
    const resolvable = toResolvableInput(ctx, params.utxo);
    const script = toPlutusScriptSource(ctx, params.script);
    checkLock(ctx, resolvable.utxo, {
      type: "script",
      hash: script.scriptHash,
    });
    const datum = toSpendDatum(
      ctx,
      params.datum,
      resolvable.utxo,
      script.version,
    );
    const { data, exUnits } = params.redeemer;
    return freeze({
      kind: "spend",
      ...resolvable,
      witness: {
        type: "plutus",
        script,
        ...(datum && { datum }),
        redeemer: {
          data: toPlutusData(ctx, data).data,
          ...(exUnits && { exUnits: toExUnits(ctx, exUnits) }),
        },
      },
      ...labelOf(params.label),
    });
  },
};

/**
 * Read an output without spending it: its datum and reference script become visible to the
 * transaction's scripts.
 * @param params.utxo The output, by reference or in full
 * @param params.label Name echoed in errors about this part
 */
export const referenceInput = (params: {
  utxo: InputRef;
  label?: string;
}): ReferenceInputPart => {
  const ctx: PartContext = { part: "referenceInput", label: params.label };
  return freeze({
    kind: "referenceInput",
    ...toResolvableInput(ctx, params.utxo),
    ...labelOf(params.label),
  });
};

/**
 * Put up an output as collateral, forfeited only if a script of the transaction fails.
 * @param params.utxo A key-locked output, by reference or in full
 * @param params.label Name echoed in errors about this part
 */
export const collateral = (params: {
  utxo: InputRef;
  label?: string;
}): CollateralPart => {
  const ctx: PartContext = { part: "collateral", label: params.label };
  const resolvable = toResolvableInput(ctx, params.utxo);
  checkLock(ctx, resolvable.utxo, { type: "key" });
  return freeze({
    kind: "collateral",
    ...resolvable,
    ...labelOf(params.label),
  });
};

/**
 * Send what is left of the collateral after a script failure to an address, so that only the
 * required amount is forfeited rather than the whole of the collateral inputs.
 * @param params.address Where the rest of the collateral goes
 * @param params.totalCollateral Lovelace forfeited on failure; worked out from the fee when
 *   omitted
 * @param params.label Name echoed in errors about this part
 */
export const collateralReturn = (params: {
  address: string;
  totalCollateral?: bigint;
  label?: string;
}): CollateralReturnPart => {
  const ctx: PartContext = { part: "collateralReturn", label: params.label };
  parseAddress(ctx, params.address);
  const { totalCollateral } = params;
  if (
    totalCollateral !== undefined &&
    (typeof totalCollateral !== "bigint" || totalCollateral <= 0n)
  )
    fail(ctx, "INVALID_VALUE", `invalid total collateral ${totalCollateral}`);
  return freeze({
    kind: "collateralReturn",
    address: params.address,
    ...(totalCollateral !== undefined && {
      totalCollateral: totalCollateral.toString(),
    }),
    ...labelOf(params.label),
  });
};
