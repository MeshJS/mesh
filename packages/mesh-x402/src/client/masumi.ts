import { IFetcher, Protocol, UTxO } from "@meshsdk/common";
import { MeshTxBuilder } from "@meshsdk/transaction";

import { slotToUnixMs, unixMsToSlot } from "../chain";
import {
  AllowMasumiDeployment,
  isMasumiDeploymentAllowed,
  masumiEscrowAddress,
  resolveMasumiDeployment,
} from "../masumi/escrow-address";
import { buildMasumiLock } from "../masumi/lock";
import {
  checkRegistryClaim,
  MasumiRegistryValidator,
  validateMasumiRequirementsFull,
} from "../masumi/validate";
import { LOVELACE, toMeshUnit } from "../types/asset";
import { X402Error } from "../types/errors";
import {
  PaymentRequirements,
  PaymentRequirementsExtraMasumi,
  ResourceInfo,
} from "../types/payment-requirements";
import { paymentTtlSlot } from "./ttl";

/** Builds the unsigned escrow-lock transaction for the `masumi` assetTransferMethod. */
export const buildMasumiEscrowPayment = async (
  requirement: PaymentRequirements,
  buyerAddress: string,
  utxos: UTxO[],
  protocol: Protocol,
  currentSlot: number,
  fetcher: IFetcher,
  allowDeployment?: AllowMasumiDeployment,
  registry?: { resource: ResourceInfo; validate?: MasumiRegistryValidator },
): Promise<string> => {
  const extra = requirement.extra as PaymentRequirementsExtraMasumi;

  // Validate everything the spec says a client SHOULD check before signing: closed-object
  // schema, commitment digests, seller COSE authorization over `termsDigest`, escrow address
  // derivation and the compatibility identifier. A lock that fails any of these would either
  // be rejected by the facilitator or - worse - silently strand the funds.
  const failure = await validateMasumiRequirementsFull(requirement);
  if (failure) throw new X402Error(failure.code, failure.detail);

  const registryFailure = await checkRegistryClaim(
    requirement,
    registry?.resource,
    registry?.validate,
  );
  if (registryFailure)
    throw new X402Error(registryFailure.code, registryFailure.detail);

  const deployment = resolveMasumiDeployment(
    requirement.network,
    extra.deployment,
  );
  if (!deployment) {
    throw new X402Error(
      "MASUMI_ESCROW_ADDRESS_MISMATCH",
      `${requirement.network} has no canonical Masumi deployment - requirements must declare "extra.deployment"`,
    );
  }

  const escrowAddress = masumiEscrowAddress(requirement.network, deployment);
  if (escrowAddress !== requirement.payTo) {
    throw new X402Error(
      "MASUMI_ESCROW_ADDRESS_MISMATCH",
      `Derived Masumi escrow address ${escrowAddress} does not match payTo ${requirement.payTo} - refusing to pay into an unverified escrow`,
    );
  }
  if (
    !(await isMasumiDeploymentAllowed(
      requirement.network,
      deployment,
      allowDeployment,
    ))
  ) {
    throw new X402Error(
      "MASUMI_DEPLOYMENT_NOT_ALLOWED",
      "extra.deployment is not the canonical Masumi deployment and the application has not explicitly allowed it",
    );
  }

  // The lock's TTL must be on/before `pay_by_time`, so cap it there (and refuse a lock that can no longer land in time).
  const payByTime = Number(extra.terms!.payByTime);
  const ttlSlot = Math.min(
    paymentTtlSlot(requirement, currentSlot),
    unixMsToSlot(requirement.network, payByTime),
  );
  if (
    ttlSlot <= currentSlot ||
    slotToUnixMs(requirement.network, ttlSlot) > payByTime
  ) {
    throw new X402Error(
      "MASUMI_PAY_BY_TIME_PASSED",
      "terms.payByTime has already passed (or leaves no validity window)",
    );
  }

  const unit = toMeshUnit(requirement.asset);
  const amount = BigInt(requirement.amount);
  const coinsPerUtxoByte = BigInt(protocol.coinsPerUtxoSize);

  const lock = buildMasumiLock(
    extra,
    buyerAddress,
    requirement.asset,
    amount,
    coinsPerUtxoByte,
  );

  const outputAmount =
    unit === LOVELACE
      ? [{ unit: LOVELACE, quantity: lock.lockedLovelace.toString() }]
      : [
          { unit, quantity: amount.toString() },
          { unit: LOVELACE, quantity: lock.lockedLovelace.toString() },
        ];

  const txBuilder = new MeshTxBuilder({ fetcher, verbose: false });
  txBuilder
    .txOut(requirement.payTo, outputAmount)
    .txOutInlineDatumValue(lock.datum, "Mesh")
    .changeAddress(buyerAddress)
    .selectUtxosFrom(utxos)
    .invalidHereafter(ttlSlot);

  return txBuilder.complete();
};
