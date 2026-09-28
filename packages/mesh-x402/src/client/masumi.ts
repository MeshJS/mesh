import { MeshTxBuilder } from "@meshsdk/transaction";
import { IFetcher, Protocol, UTxO } from "@meshsdk/common";

import { LOVELACE, toMeshUnit } from "../types/asset";
import { PaymentRequirements, PaymentRequirementsExtraMasumi } from "../types/payment-requirements";
import { X402Error } from "../types/errors";
import { buildMasumiLock } from "../masumi/lock";
import { masumiEscrowAddress, resolveMasumiDeployment } from "../masumi/escrow-address";

/** Builds the unsigned escrow-lock transaction for the `masumi` assetTransferMethod. */
export const buildMasumiEscrowPayment = async (
  requirement: PaymentRequirements,
  buyerAddress: string,
  utxos: UTxO[],
  protocol: Protocol,
  currentSlot: number,
  fetcher: IFetcher,
): Promise<string> => {
  const extra = requirement.extra as PaymentRequirementsExtraMasumi;

  const deployment = resolveMasumiDeployment(requirement.network, extra.deployment);
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

  const unit = toMeshUnit(requirement.asset);
  const amount = BigInt(requirement.amount);
  const coinsPerUtxoByte = BigInt(protocol.coinsPerUtxoSize);

  const lock = buildMasumiLock(extra, buyerAddress, requirement.asset, amount, coinsPerUtxoByte);

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
    .invalidHereafter(currentSlot + requirement.maxTimeoutSeconds);

  return txBuilder.complete();
};
