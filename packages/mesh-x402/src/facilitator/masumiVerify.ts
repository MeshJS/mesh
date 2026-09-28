import { deserializeTx, deserializeBech32Address } from "@meshsdk/core-cst";
import { IFetcher } from "@meshsdk/common";

import { LOVELACE } from "../types/asset";
import { PaymentRequirementsExtraMasumi } from "../types/payment-requirements";
import { PaymentPayload } from "../types/payment-payload";
import { addressCredentials, parseMasumiLockDatum } from "../masumi/datum";
import { masumiEscrowAddress, resolveMasumiDeployment } from "../masumi/escrow-address";
import { buildSignedTerms, computeInputHash, computeTermsDigest } from "../masumi/terms";
import { masumiDeadlineIntervalsHold, MASUMI_MIN_COLLATERAL_LOVELACE } from "../masumi/constants";
import { verifySellerTermsSignature } from "../masumi/cose";
import { invalid, VerifyResult } from "./verify";

/**
 * Runs the full Masumi checklist against a payload whose core 8 rules already passed.
 * Composed of independently-reasoned sub-checks so a failure always names the specific rule
 * that broke, rather than a generic "invalid masumi payment".
 */
export const verifyMasumiPayment = async (
  payload: PaymentPayload,
  tx: ReturnType<typeof deserializeTx>,
  fetcher: IFetcher,
  currentSlot: number,
): Promise<VerifyResult> => {
  const extra = payload.accepted.extra as PaymentRequirementsExtraMasumi;
  const { terms } = extra;

  if (!terms || terms.version !== "1") return invalid("MASUMI_UNKNOWN_FIELD");
  if (terms.paymentType !== "Web3CardanoV2") return invalid("MASUMI_INVALID_PAYMENT_TYPE");
  if (!extra.inputCommitment || !extra.referenceKey || !extra.referenceSignature) {
    return invalid("MASUMI_UNKNOWN_FIELD");
  }

  // Recompute inputHash from the declared commitment manifest and compare to `terms.inputHash`.
  const recomputedInputHash = computeInputHash(extra.inputCommitment);
  if (recomputedInputHash !== terms.inputHash) return invalid("MASUMI_COMMITMENT_DIGEST_MISMATCH");

  // Recompute termsDigest and verify the seller's COSE signature over it.
  const signedTerms = buildSignedTerms(extra, payload.accepted);
  const termsDigest = computeTermsDigest(signedTerms);
  const coseValid = await verifySellerTermsSignature(
    extra.referenceKey,
    extra.referenceSignature,
    terms.sellerAddress,
    termsDigest,
  );
  if (!coseValid) return invalid("MASUMI_INVALID_COSE_SIGNATURE");

  // The escrow address is derived independently from the compiled validator + deployment
  // params, never trusted from `payTo` alone.
  const deployment = resolveMasumiDeployment(payload.accepted.network, extra.deployment);
  if (!deployment) return invalid("MASUMI_ESCROW_ADDRESS_MISMATCH");
  const escrowAddress = masumiEscrowAddress(payload.accepted.network, deployment);
  if (escrowAddress !== payload.accepted.payTo) return invalid("MASUMI_ESCROW_ADDRESS_MISMATCH");

  if (!masumiDeadlineIntervalsHold(
    BigInt(terms.payByTime),
    BigInt(terms.submitResultTime),
    BigInt(terms.unlockTime),
    BigInt(terms.externalDisputeUnlockTime),
  )) {
    return invalid("MASUMI_INVALID_DEADLINE_ORDERING");
  }

  // TTL must be on/before payByTime. Cardano slots are 1 second each (post-Shelley, on
  // mainnet/preprod/preview alike), so the TTL slot's wall-clock time can be derived
  // relative to "now" without needing each network's genesis start time as a constant.
  const ttl = tx.body().ttl();
  if (ttl === undefined) return invalid("MASUMI_TTL_AFTER_PAY_BY_TIME");
  const ttlUnixMs = Date.now() + (Number(ttl) - currentSlot) * 1000;
  if (ttlUnixMs > Number(terms.payByTime)) return invalid("MASUMI_TTL_AFTER_PAY_BY_TIME");

  // Find the single escrow output at payTo and decode its inline datum.
  const outputs = tx.body().outputs();
  let escrowOutputIndex = -1;
  for (let i = 0; i < outputs.length; i++) {
    if (outputs.at(i)!.address().toBech32().toString() === payload.accepted.payTo) {
      if (escrowOutputIndex !== -1) return invalid("MASUMI_INVALID_OUTPUT_SHAPE"); // must be a single output
      escrowOutputIndex = i;
    }
  }
  if (escrowOutputIndex === -1) return invalid("MASUMI_INVALID_OUTPUT_SHAPE");
  const escrowOutput = outputs.at(escrowOutputIndex)!;

  const datumCbor = escrowOutput.datum()?.asInlineData()?.toCbor().toString();
  if (!datumCbor) return invalid("MASUMI_INVALID_OUTPUT_SHAPE"); // must be inline, not a datum hash
  if (escrowOutput.scriptRef()) return invalid("MASUMI_INVALID_OUTPUT_SHAPE"); // no reference script

  const view = parseMasumiLockDatum(datumCbor);
  if (!view) return invalid("MASUMI_INVALID_OUTPUT_SHAPE");
  if (view.state !== 0) return invalid("MASUMI_INVALID_OUTPUT_SHAPE"); // must be FundsLocked
  if (view.resultHash !== "") return invalid("MASUMI_INVALID_OUTPUT_SHAPE");
  if (view.sellerCooldownTime !== 0n || view.buyerCooldownTime !== 0n) {
    return invalid("MASUMI_INVALID_OUTPUT_SHAPE");
  }
  if (
    view.referenceKey !== extra.referenceKey ||
    view.referenceSignature !== extra.referenceSignature ||
    view.sellerNonce !== terms.sellerNonce ||
    view.buyerNonce !== terms.buyerNonce ||
    view.inputHash !== terms.inputHash ||
    view.payByTime !== BigInt(terms.payByTime) ||
    view.submitResultTime !== BigInt(terms.submitResultTime) ||
    view.unlockTime !== BigInt(terms.unlockTime) ||
    view.externalDisputeUnlockTime !== BigInt(terms.externalDisputeUnlockTime)
  ) {
    return invalid("MASUMI_INVALID_OUTPUT_SHAPE");
  }
  const sellerCreds = addressCredentials(terms.sellerAddress);
  if (view.seller.payment.hash !== sellerCreds.payment.hash) return invalid("MASUMI_INVALID_OUTPUT_SHAPE");

  // The nonce input's owning address's payment credential must control the datum's buyer.
  const [nonceTxHash, nonceIndexStr] = payload.payload.nonce.split("#");
  const nonceCandidates = await fetcher.fetchUTxOs(nonceTxHash!, Number(nonceIndexStr));
  const nonceUtxo = nonceCandidates.find((u) => u.input.outputIndex === Number(nonceIndexStr));
  if (!nonceUtxo) return invalid("MASUMI_NONCE_NOT_BUYER_CREDENTIAL");
  const nonceOwnerCreds = deserializeBech32Address(nonceUtxo.output.address);
  const nonceOwnerPaymentHash = nonceOwnerCreds.pubKeyHash || nonceOwnerCreds.scriptHash;
  if (view.buyer.payment.isScript || nonceOwnerPaymentHash !== view.buyer.payment.hash) {
    return invalid("MASUMI_NONCE_NOT_BUYER_CREDENTIAL");
  }

  // lockedLovelace = requestedLovelace + collateralReturnLovelace.
  const isLovelace = payload.accepted.asset.toLowerCase() === LOVELACE;
  const requestedLovelace = isLovelace ? BigInt(payload.accepted.amount) : 0n;
  const lockedLovelace = escrowOutput.amount().coin();
  if (lockedLovelace !== requestedLovelace + view.collateralReturnLovelace) {
    return invalid("MASUMI_INVALID_LOCKED_LOVELACE");
  }

  // collateral_return_lovelace is 0, or >= the protocol floor.
  if (view.collateralReturnLovelace !== 0n && view.collateralReturnLovelace < MASUMI_MIN_COLLATERAL_LOVELACE) {
    return invalid("MASUMI_INVALID_COLLATERAL_RETURN");
  }

  // The escrow output holds exactly the requested asset set - no extra tokens beyond the one
  // requested (native-asset payments) or none at all (lovelace payments).
  const multiasset = escrowOutput.amount().multiasset();
  const heldAssetCount = multiasset ? Array.from(multiasset as unknown as Map<string, bigint>).length : 0;
  if (isLovelace) {
    if (heldAssetCount !== 0) return invalid("MASUMI_ASSET_SET_MISMATCH");
  } else {
    if (heldAssetCount !== 1) return invalid("MASUMI_ASSET_SET_MISMATCH");
  }

  return { isValid: true };
};
