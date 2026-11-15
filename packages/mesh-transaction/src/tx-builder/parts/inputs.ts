import type { LanguageVersion } from "@meshsdk/common";

import type { PartContext } from "./normalize";
import type {
  CollateralPart,
  CollateralReturnPart,
  InputRef,
  Linked,
  NativeScriptInput,
  PlutusScriptInput,
  RedeemerInput,
  ReferenceInputPart,
  SpendDatum,
  SpendDatumInput,
  SpendPart,
  StepChange,
  StepOutput,
  Utxo,
} from "./types";
import {
  addressText,
  checkCredential,
  fail,
  freeze,
  isStepLink,
  labelOf,
  parseAddress,
  partContext,
  paymentCredential,
  toNativeScriptSource,
  toPlutusData,
  toPlutusScriptSource,
  toRedeemer,
  toResolvableInput,
  toStepLink,
  withKnownHash,
} from "./normalize";
import { shownValue } from "./shape";
import { utxoKey } from "./utxo";

/**
 * Checks that a known output is locked the way its witness expects: by a key, or by the script
 * with the given hash (when the hash is known).
 */
export const checkLock = (
  ctx: PartContext,
  utxo: Utxo | undefined,
  expected: { type: "key" } | { type: "script"; hash?: string },
) => {
  if (!utxo) return undefined;
  // Byron addresses carry no payment credential and are always key-locked
  const credential = paymentCredential(parseAddress(ctx, utxo.address)) ?? {
    type: "key" as const,
  };
  const outRef = utxoKey(utxo);
  checkCredential(ctx, outRef, credential, expected);
  return credential;
};

/**
 * Works out the datum of a spent script output, checking an explicit choice against the
 * output when it is known.
 */
export const toSpendDatum = (
  ctx: PartContext,
  datum: SpendDatumInput | undefined,
  utxo: Utxo | undefined,
  version: LanguageVersion | undefined,
): SpendDatum | undefined => {
  const outRef = utxo && utxoKey(utxo);
  const inlineDatum = utxo?.datum?.type === "inline";
  const datumHash = utxo?.datum?.type === "hash" ? utxo.datum.hash : undefined;
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
    if (typeof datum !== "object" || datum === null)
      fail(
        ctx,
        "INVALID_DATA",
        `invalid datum ${shownValue(datum)}: expected "inline", "none" or { data }`,
      );
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

// Each builder below takes a link to an earlier step in its first overload, so that its last,
// which `ReturnType` reads, is the part with its input

/** The value given as `utxo` read as a link to an earlier step, or undefined for a UTxO */
const linkOf = (
  ctx: PartContext,
  utxo: unknown,
  change: boolean,
): StepOutput | StepChange | undefined =>
  isStepLink(utxo)
    ? toStepLink(ctx, utxo as Record<string, unknown>, change)
    : undefined;

/** Spend an output of an earlier step of a plan, or all its change, locked by a payment key */
function pubKey(params: {
  utxo: StepOutput | StepChange;
  label?: string;
}): Linked<SpendPart>;
/**
 * Spend an output locked by a payment key.
 * @param params.utxo The output, by reference or in full; in a plan, an output of an earlier
 *   step (`{ step, output }`), or all the change of an earlier step (`{ step, change: true }`).
 *   A part linked to an earlier step holds the link in place of the input, and the lock of the
 *   output is checked when the plan builds the step, as for an output given by out ref
 * @param params.label Name echoed in errors about this part
 */
function pubKey(params: { utxo: InputRef; label?: string }): SpendPart;
function pubKey(params: {
  utxo: InputRef | StepOutput | StepChange;
  label?: string;
}): SpendPart | Linked<SpendPart> {
  const ctx = partContext("spend", params);
  const link = linkOf(ctx, params.utxo, true);
  if (link)
    return freeze({
      kind: "spend",
      link,
      witness: { type: "key" },
      ...labelOf(params.label),
    });
  const resolvable = toResolvableInput(ctx, params.utxo as InputRef);
  checkLock(ctx, resolvable.utxo, { type: "key" });
  return freeze({
    kind: "spend",
    ...resolvable,
    witness: { type: "key" },
    ...labelOf(params.label),
  });
}

/** Spend an output of an earlier step of a plan locked by a native script */
function native(params: {
  utxo: StepOutput;
  script: NativeScriptInput;
  label?: string;
}): Linked<SpendPart>;
/**
 * Spend an output locked by a native script.
 * @param params.utxo The output, by reference or in full; in a plan, an output of an earlier
 *   step (`{ step, output }`). A part linked to an earlier step holds the link in place of the
 *   input, and the lock of the output is checked against the script when the plan builds the
 *   step, as for an output given by out ref
 * @param params.script The script: attached as a `NativeScript` or its CBOR, or held in a
 *   reference output (`{ reference }`)
 * @param params.label Name echoed in errors about this part
 */
function native(params: {
  utxo: InputRef;
  script: NativeScriptInput;
  label?: string;
}): SpendPart;
function native(params: {
  utxo: InputRef | StepOutput;
  script: NativeScriptInput;
  label?: string;
}): SpendPart | Linked<SpendPart> {
  const ctx = partContext("spend", params);
  const link = linkOf(ctx, params.utxo, false);
  const resolvable = link
    ? undefined
    : toResolvableInput(ctx, params.utxo as InputRef);
  const given = toNativeScriptSource(ctx, params.script);
  const script = withKnownHash(
    given,
    checkLock(ctx, resolvable?.utxo, {
      type: "script",
      hash: given.scriptHash,
    }),
  );
  return freeze({
    kind: "spend",
    ...(link ? { link } : resolvable!),
    witness: { type: "native", script },
    ...labelOf(params.label),
  });
}

/** Spend an output of an earlier step of a plan locked by a Plutus script */
function plutus(params: {
  utxo: StepOutput;
  script: PlutusScriptInput;
  redeemer: RedeemerInput;
  datum?: SpendDatumInput;
  label?: string;
}): Linked<SpendPart>;
/**
 * Spend an output locked by a Plutus script.
 * @param params.utxo The output, by reference or in full; in a plan, an output of an earlier
 *   step (`{ step, output }`). A part linked to an earlier step holds the link in place of the
 *   input; the lock of the output, and its datum when `datum` is omitted or given, are worked
 *   out and checked when the plan builds the step, as for an output given by out ref
 * @param params.script The script: attached (`{ code, version }`, the code flat or in one or
 *   two CBOR wrappings) or held in a reference output (`{ reference }`)
 * @param params.redeemer Data, or a function of the final transaction (`self`: this input's
 *   index), with execution units if already known
 * @param params.datum The datum of the output; worked out from the output when omitted
 * @param params.label Name echoed in errors about this part, such as a script failure
 */
function plutus(params: {
  utxo: InputRef;
  script: PlutusScriptInput;
  redeemer: RedeemerInput;
  datum?: SpendDatumInput;
  label?: string;
}): SpendPart;
function plutus(params: {
  utxo: InputRef | StepOutput;
  script: PlutusScriptInput;
  redeemer: RedeemerInput;
  datum?: SpendDatumInput;
  label?: string;
}): SpendPart | Linked<SpendPart> {
  const ctx = partContext("spend", params);
  const link = linkOf(ctx, params.utxo, false);
  const resolvable = link
    ? undefined
    : toResolvableInput(ctx, params.utxo as InputRef);
  const given = toPlutusScriptSource(ctx, params.script);
  const script = withKnownHash(
    given,
    checkLock(ctx, resolvable?.utxo, {
      type: "script",
      hash: given.scriptHash,
    }),
  );
  const datum = toSpendDatum(
    ctx,
    params.datum,
    resolvable?.utxo,
    script.version,
  );
  return freeze({
    kind: "spend",
    ...(link ? { link } : resolvable!),
    witness: {
      type: "plutus",
      script,
      ...(datum && { datum }),
      redeemer: toRedeemer(ctx, params.redeemer),
    },
    ...labelOf(params.label),
  });
}

/** Spend an existing output, or one of an earlier step of a plan */
export const spend = { pubKey, native, plutus };

/** Read an output of an earlier step of a plan without spending it */
export function referenceInput(params: {
  utxo: StepOutput;
  label?: string;
}): Linked<ReferenceInputPart>;
/**
 * Read an output without spending it: its datum and reference script become visible to the
 * transaction's scripts. Given by out ref, the part assembles as it is, since only the out ref
 * goes into the body; `build()` still reads the output. One output read by several parts is one
 * reference input; an output the transaction also spends is not a reference input at all: its
 * datum and reference script are visible as those of a spent input. The part never makes its
 * output spent, and selection never takes it.
 * @param params.utxo The output, by reference or in full; in a plan, an output of an earlier
 *   step (`{ step, output }`), which the part holds as a link in place of the input
 * @param params.label Name echoed in errors about this part
 */
export function referenceInput(params: {
  utxo: InputRef;
  label?: string;
}): ReferenceInputPart;
export function referenceInput(params: {
  utxo: InputRef | StepOutput;
  label?: string;
}): ReferenceInputPart | Linked<ReferenceInputPart> {
  const ctx = partContext("referenceInput", params);
  const link = linkOf(ctx, params.utxo, false);
  return freeze({
    kind: "referenceInput",
    ...(link ? { link } : toResolvableInput(ctx, params.utxo as InputRef)),
    ...labelOf(params.label),
  });
}

/** Put up an output of an earlier step of a plan as collateral */
export function collateral(params: {
  utxo: StepOutput;
  label?: string;
}): Linked<CollateralPart>;
/**
 * Put up an output as collateral, forfeited only if a script of the transaction fails. When the
 * collateral inputs given this way do not cover the collateral, the build adds inputs from the
 * payer's UTxOs after them, unless its option `topUpCollateral` is false. A build with
 * `collateralReturn: false` forfeits all of its lovelace, and refuses one holding a token
 * (INVALID_COLLATERAL).
 * @param params.utxo A key-locked output, by reference or in full; in a plan, an output of an
 *   earlier step (`{ step, output }`), which the part holds as a link in place of the input,
 *   its lock checked when the plan builds the step
 * @param params.label Name echoed in errors about this part
 */
export function collateral(params: {
  utxo: InputRef;
  label?: string;
}): CollateralPart;
export function collateral(params: {
  utxo: InputRef | StepOutput;
  label?: string;
}): CollateralPart | Linked<CollateralPart> {
  const ctx = partContext("collateral", params);
  const link = linkOf(ctx, params.utxo, false);
  if (link)
    return freeze({ kind: "collateral", link, ...labelOf(params.label) });
  const resolvable = toResolvableInput(ctx, params.utxo as InputRef);
  checkLock(ctx, resolvable.utxo, { type: "key" });
  return freeze({
    kind: "collateral",
    ...resolvable,
    ...labelOf(params.label),
  });
}

/**
 * Send what is left of the collateral after a script failure to an address, so that only the
 * required amount is forfeited rather than the whole of the collateral inputs. A build with
 * `collateralReturn: false` refuses this part (INVALID_OPTION).
 * @param params.address Where the rest of the collateral goes, in bech32, base58 (Byron) or hex
 * @param params.totalCollateral Lovelace forfeited on failure; worked out from the fee when
 *   omitted. Given collateral inputs that do not hold it are topped up as for the fee
 * @param params.label Name echoed in errors about this part
 */
export const collateralReturn = (params: {
  address: string;
  totalCollateral?: bigint;
  label?: string;
}): CollateralReturnPart => {
  const ctx = partContext("collateralReturn", params);
  const address = parseAddress(ctx, params.address);
  if (address.asReward())
    fail(
      ctx,
      "INVALID_ADDRESS",
      `reward address ${params.address} cannot receive transaction outputs`,
    );
  const { totalCollateral } = params;
  if (
    totalCollateral !== undefined &&
    (typeof totalCollateral !== "bigint" || totalCollateral <= 0n)
  )
    fail(
      ctx,
      "INVALID_VALUE",
      `invalid total collateral ${shownValue(totalCollateral)}`,
    );
  return freeze({
    kind: "collateralReturn",
    address: addressText(address),
    ...(totalCollateral !== undefined && {
      totalCollateral: totalCollateral.toString(),
    }),
    ...labelOf(params.label),
  });
};
