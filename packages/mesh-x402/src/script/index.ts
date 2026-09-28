/**
 * Support for x402's `script` assetTransferMethod: payment locked into an arbitrary,
 * server-defined Plutus script address. Per spec, the facilitator validates that `payTo`
 * matches the derived/declared script address, but never validates datum *content* - that's
 * the resource server's responsibility.
 */
import { applyParamsToScript, resolvePlutusScriptAddress, scriptHashToBech32 } from "@meshsdk/core-cst";

import { toNetworkId, CardanoNetwork } from "../types/network";
import { PaymentRequirementsExtraScript } from "../types/payment-requirements";

const versionMap = { plutusV1: "V1", plutusV2: "V2", plutusV3: "V3" } as const;

/**
 * Derives the script address for a `script`-method requirement: applies `parameters` to
 * `script.code` when both are given, else trusts `scriptHash` directly (a facilitator-only
 * case, since a client building a payment needs the actual script to attach as a witness).
 */
export const resolveScriptAddress = (
  extra: PaymentRequirementsExtraScript,
  network: CardanoNetwork,
): string => {
  const networkId = toNetworkId(network);

  if (extra.script) {
    const version = versionMap[extra.script.type];
    const params = Object.values(extra.parameters ?? {}).map((p) => p.value);
    const code = params.length
      ? applyParamsToScript(extra.script.code, params as object[], "JSON")
      : extra.script.code;
    return resolvePlutusScriptAddress({ version, code }, networkId);
  }

  if (extra.scriptHash) {
    return scriptHashToBech32(extra.scriptHash, undefined, networkId);
  }

  throw new Error("script-method PaymentRequirements must declare `script` or `scriptHash`");
};

/** Passes the server-supplied datum through unmodified - the client does not interpret it. */
export const buildScriptOutputDatum = (extra: PaymentRequirementsExtraScript): string | undefined =>
  extra.datum;
