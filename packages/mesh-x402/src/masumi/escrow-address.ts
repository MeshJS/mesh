/**
 * Derivation of the deployment-specific `vested_pay` escrow address.
 *
 * The validator parameters are baked into the script hash, so a different parameterization
 * is a different address - and a look-alike `vested_pay` with different admins is a
 * different trust domain. The facilitator therefore derives the address itself from the
 * canonical compiled validator and requires it to equal `payTo`; `payTo` is never defaulted
 * or inferred. Mirrors `x402-foundation/x402`'s `blueprint.ts` (Apache-2.0), but uses Mesh's
 * own `applyParamsToScript`/`resolvePlutusScriptAddress` instead of Evolution SDK.
 */
import {
  applyParamsToScript,
  resolvePlutusScriptAddress,
  resolvePlutusScriptHash,
} from "@meshsdk/core-cst";
import { PlutusScript } from "@meshsdk/common";

import { CardanoNetwork, toNetworkId } from "../types/network";
import { MasumiDeployment } from "../types/payment-requirements";
import { MASUMI_VESTED_PAY_COMPILED_CODE } from "./blueprintCode";

/** CIP-57 validator title this scheme locks into. */
export const MASUMI_VALIDATOR_TITLE = "vested_pay.vested_pay.spend";

/**
 * Canonical deployment parameters. Mainnet and Preprod default to these when
 * `extra.deployment` is absent; Preview has no canonical deployment and always requires an
 * explicit one.
 */
export const MASUMI_DEFAULT_DEPLOYMENT: MasumiDeployment = {
  requiredAdmins: "2",
  adminVkeys: [
    "fc16a1fcf309aed03ec18bb2176f5ea29acea70bb79145ebaffa8e75",
    "7f78161369549d8e2b138fee724c9fa606d6107a66720bdb4c48ada6",
    "89eef9ea84e0ee7fe4921fa93eb2873ff6e34473f751d5d52cb75aa6",
  ],
  cooldownPeriod: "420000",
};

/**
 * Resolves which deployment parameters apply to a payment: the declared `extra.deployment`
 * when present, else the canonical default for mainnet/preprod (preview has none).
 */
export const resolveMasumiDeployment = (
  network: CardanoNetwork,
  declared: MasumiDeployment | undefined,
): MasumiDeployment | null => {
  if (declared) return declared;
  return network === "cardano:preview" ? null : MASUMI_DEFAULT_DEPLOYMENT;
};

const appliedScriptCache = new Map<string, PlutusScript>();

/**
 * Applies a deployment's three parameters to the canonical compiled validator. Admin key
 * order and duplicates are preserved - a repeated key carries repeated voting weight and
 * changes the hash. Applying + parsing is pure, so memoize it per parameterization.
 */
export const resolveMasumiEscrowScript = (deployment: MasumiDeployment): PlutusScript =>
  applyMasumiDeployment(deployment);

const applyMasumiDeployment = (deployment: MasumiDeployment): PlutusScript => {
  const cacheKey = `${deployment.requiredAdmins}|${deployment.adminVkeys.join(",")}|${deployment.cooldownPeriod}`;
  const cached = appliedScriptCache.get(cacheKey);
  if (cached) return cached;

  const code = applyParamsToScript(
    MASUMI_VESTED_PAY_COMPILED_CODE,
    [BigInt(deployment.requiredAdmins), deployment.adminVkeys, BigInt(deployment.cooldownPeriod)],
    "Mesh",
  );
  const script: PlutusScript = { version: "V3", code };

  if (appliedScriptCache.size >= 1000) {
    const oldest = appliedScriptCache.keys().next().value;
    if (oldest !== undefined) appliedScriptCache.delete(oldest);
  }
  appliedScriptCache.set(cacheKey, script);
  return script;
};

/** Derives the escrow validator's script hash for a deployment (network-independent). */
export const masumiEscrowScriptHash = (deployment: MasumiDeployment): string => {
  const script = applyMasumiDeployment(deployment);
  // Enterprise addresses at any networkId share the same payment-credential hash for a
  // given script, so deriving via networkId 0 and reading the hash back out is sufficient.
  return resolvePlutusScriptHash(resolvePlutusScriptAddress(script, 0));
};

/** Derives the bech32 escrow address for a deployment on a network. */
export const masumiEscrowAddress = (
  network: CardanoNetwork,
  deployment: MasumiDeployment = MASUMI_DEFAULT_DEPLOYMENT,
): string => resolvePlutusScriptAddress(applyMasumiDeployment(deployment), toNetworkId(network));
