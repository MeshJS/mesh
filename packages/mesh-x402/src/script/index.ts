/**
 * Support for x402's `script` assetTransferMethod: payment locked into an arbitrary,
 * server-defined Plutus script address. Per spec, the facilitator validates that `payTo`
 * matches the derived/declared script address, but never validates datum *content* - that's
 * the resource server's responsibility.
 */
import { dataFromCbor, dataToCbor } from "@harmoniclabs/plutus-data";

import { Data, mConStr } from "@meshsdk/common";
import {
  applyParamsToScript,
  deserializeBech32Address,
  resolvePlutusScriptAddress,
  resolvePlutusScriptHash,
  scriptHashToBech32,
} from "@meshsdk/core-cst";

import { CardanoNetwork, toNetworkId } from "../types/network";
import {
  PaymentRequirementsExtraScript,
  ScriptParameter,
} from "../types/payment-requirements";

const versionMap = { plutusV1: "V1", plutusV2: "V2", plutusV3: "V3" } as const;

const EVEN_HEX = /^([0-9a-f]{2})*$/;

/**
 * Converts one typed script parameter to Plutus data, with the same semantics as the
 * reference implementation: `bytes` is lowercase even-length hex, `string` is UTF-8 text
 * encoded as bytes, `bigint`/`integer` is a canonical integer, `boolean` is `Constr 0|1 []`.
 */
const parameterToData = (param: ScriptParameter): Data => {
  if (!param || typeof param !== "object")
    throw new Error("script parameter must be an object");
  switch (param.type) {
    case "bytes":
      if (typeof param.value !== "string" || !EVEN_HEX.test(param.value)) {
        throw new Error("bytes parameter must be lowercase even-length hex");
      }
      return param.value;
    case "string":
      if (typeof param.value !== "string")
        throw new Error("string parameter must carry a string");
      return Buffer.from(param.value, "utf8").toString("hex");
    case "bigint":
    case "integer": {
      const v = param.value;
      if (
        typeof v === "number"
          ? !Number.isSafeInteger(v)
          : typeof v !== "bigint" &&
            !(typeof v === "string" && /^(0|-?[1-9][0-9]*)$/.test(v))
      ) {
        throw new Error(
          "integer parameter must be a safe integer or canonical decimal string",
        );
      }
      return BigInt(v as string | number | bigint);
    }
    case "boolean":
      if (typeof param.value !== "boolean")
        throw new Error("boolean parameter must carry a boolean");
      return mConStr(param.value ? 1 : 0, []);
    default:
      throw new Error(
        `Unsupported script parameter type: ${String((param as ScriptParameter).type)}`,
      );
  }
};

/** The final (parameter-applied) script code of a `script`-method requirement. */
const appliedScriptCode = (extra: PaymentRequirementsExtraScript): string => {
  const script = extra.script!;
  if (!EVEN_HEX.test(script.code) || script.code.length === 0)
    throw new Error("script.code must be lowercase even-length hex");
  const params = Object.values(extra.parameters ?? {}).map(parameterToData);
  return params.length
    ? applyParamsToScript(script.code, params, "Mesh")
    : script.code;
};

/**
 * Derives the script payment-credential hash a `script`-method requirement implies: applies
 * `parameters` to `script.code` when a script is declared, else uses `scriptHash` directly.
 * When both are declared they must agree - otherwise the advertised hash is not the script
 * the client would actually be locking into.
 */
export const resolveScriptHash = (
  extra: PaymentRequirementsExtraScript,
): string => {
  if (
    extra.scriptHash !== undefined &&
    !/^[0-9a-f]{56}$/.test(extra.scriptHash)
  ) {
    throw new Error("scriptHash must be 28-byte lowercase hex");
  }
  if (extra.script) {
    const code = appliedScriptCode(extra);
    const hash = resolvePlutusScriptHash(
      resolvePlutusScriptAddress(
        { version: versionMap[extra.script.type], code },
        0,
      ),
    );
    if (extra.scriptHash !== undefined && extra.scriptHash !== hash) {
      throw new Error(
        "scriptHash does not match the script after applying parameters",
      );
    }
    return hash;
  }
  if (extra.scriptHash) return extra.scriptHash;
  throw new Error(
    "script-method PaymentRequirements must declare `script` or `scriptHash`",
  );
};

/**
 * Derives the (enterprise) script address for a `script`-method requirement. `payTo` may
 * legitimately carry a stake part, so verification compares credentials via
 * `scriptPayToMatches` rather than whole addresses.
 */
export const resolveScriptAddress = (
  extra: PaymentRequirementsExtraScript,
  network: CardanoNetwork,
): string => {
  const networkId = toNetworkId(network);
  const hash = resolveScriptHash(extra); // also validates `scriptHash` agreement with `script`
  return scriptHashToBech32(hash, undefined, networkId);
};

/** Whether `payTo` is a script address whose payment credential equals the declared/derived script hash. */
export const scriptPayToMatches = (
  extra: PaymentRequirementsExtraScript,
  payTo: string,
): boolean => {
  try {
    return (
      deserializeBech32Address(payTo).scriptHash === resolveScriptHash(extra)
    );
  } catch {
    return false;
  }
};

/** A Plutus V1 script cannot spend an output that carries an inline datum, so that combination strands funds. */
export const scriptV1WithInlineDatum = (
  extra: PaymentRequirementsExtraScript,
): boolean => extra.script?.type === "plutusV1" && extra.datum !== undefined;

/**
 * The inline datum the `payTo` output carries, passed through verbatim (the client does not
 * interpret it). `undefined` when the script spends without one. Rejects anything that is not
 * non-empty CBOR hex.
 */
export const buildScriptOutputDatum = (
  extra: PaymentRequirementsExtraScript,
): string | undefined => {
  if (extra.datum === undefined) return undefined;
  if (
    typeof extra.datum !== "string" ||
    extra.datum.length === 0 ||
    !/^([0-9a-fA-F]{2})+$/.test(extra.datum)
  ) {
    throw new Error('script "datum" must be non-empty CBOR hex');
  }
  return extra.datum;
};

/**
 * Compares the datum a script offer declares with the inline datum found on the `payTo` output.
 * The contents are never judged (that is the server's contract, not ours); only that the declared
 * datum is the one attached. Datums are compared as Plutus data trees, so equivalent CBOR
 * encodings of the same datum match. Returns `"ok"` when none is declared.
 */
export const declaredDatumStatus = (
  extra: PaymentRequirementsExtraScript,
  inlineDatumCbor: string | undefined,
): "ok" | "missing" | "mismatch" => {
  if (extra.datum === undefined) return "ok";
  if (inlineDatumCbor === undefined) return "missing";
  try {
    const canonical = (cbor: string) =>
      dataToCbor(dataFromCbor(cbor)).toString();
    return canonical(extra.datum) === canonical(inlineDatumCbor)
      ? "ok"
      : "mismatch";
  } catch {
    return "mismatch";
  }
};
