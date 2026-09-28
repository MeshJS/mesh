import { randomBytes } from "crypto";
import { MeshWallet } from "@meshsdk/wallet";

import { PaymentRequirements, PaymentRequirementsExtraMasumi, MasumiDeployment } from "../../src/types/payment-requirements";
import {
  buildSignedTerms,
  commitmentPartDigest,
  computeInputHash,
  computeTermsDigest,
  MASUMI_DEFAULT_DEPLOYMENT,
  masumiEscrowAddress,
} from "../../src/masumi";

export type MasumiFixtureOptions = {
  amount?: string;
  asset?: string;
  maxTimeoutSeconds?: number;
  deployment?: MasumiDeployment;
  /** Milliseconds from now to `payByTime`; the other 3 deadlines derive from it with spec-minimum gaps + margin. */
  payByTimeOffsetMs?: number;
};

/**
 * Builds a fully-valid masumi `PaymentRequirements` (seller-signed terms included), the way a
 * resource server would issue it in a 402 challenge. Reused by the end-to-end flow test and by
 * tests that mutate one field of an otherwise-valid baseline.
 */
export const buildMasumiRequirements = async (
  sellerWallet: MeshWallet,
  options: MasumiFixtureOptions = {},
): Promise<PaymentRequirements> => {
  const deployment = options.deployment ?? MASUMI_DEFAULT_DEPLOYMENT;
  const sellerAddress = await sellerWallet.getChangeAddress();
  const payTo = masumiEscrowAddress("cardano:preprod", deployment);

  const amount = options.amount ?? "2000000";
  const asset = options.asset ?? "lovelace";
  const maxTimeoutSeconds = options.maxTimeoutSeconds ?? 300;

  const now = Date.now();
  const payByTime = now + (options.payByTimeOffsetMs ?? 60 * 60 * 1000); // default: 1h out
  const submitResultTime = payByTime + 6 * 60 * 1000; // payByTime + 5min minimum + margin
  const unlockTime = submitResultTime + 16 * 60 * 1000; // + 15min minimum + margin
  const externalDisputeUnlockTime = unlockTime + 16 * 60 * 1000;

  const resourceContent = { url: "https://example.com/resource" };
  const commitmentPart = {
    name: "resource",
    canonicalization: "jcs" as const,
    content: resourceContent,
    digest: commitmentPartDigest({ canonicalization: "jcs", content: resourceContent }),
  };
  const inputCommitment = {
    version: "1" as const,
    algorithm: "sha256" as const,
    parts: [commitmentPart],
    digest: "", // filled in below, not cryptographically checked against this field
  };
  const inputHash = computeInputHash(inputCommitment);
  inputCommitment.digest = inputHash;

  const termsWithoutSignature = {
    version: "1" as const,
    paymentType: "Web3CardanoV2" as const,
    sellerAddress,
    sellerNonce: randomBytes(32).toString("hex"),
    buyerNonce: randomBytes(10).toString("hex"),
    agentIdentifier: "",
    inputHash,
    payByTime: String(payByTime),
    submitResultTime: String(submitResultTime),
    unlockTime: String(unlockTime),
    externalDisputeUnlockTime: String(externalDisputeUnlockTime),
  };

  const requirementsBase: Omit<PaymentRequirements, "extra"> = {
    scheme: "exact",
    network: "cardano:preprod",
    amount,
    asset,
    payTo,
    maxTimeoutSeconds,
  };

  const extraBeforeSignature: PaymentRequirementsExtraMasumi = {
    assetTransferMethod: "masumi",
    confirmationPolicy: { l1Confirmations: 1 },
    inputCommitment,
    terms: termsWithoutSignature,
    // Only declared when a non-canonical deployment was requested; omitting it lets
    // resolveMasumiDeployment fall back to MASUMI_DEFAULT_DEPLOYMENT, same as before.
    ...(options.deployment ? { deployment: options.deployment } : {}),
  };

  const termsDigest = computeTermsDigest(
    buildSignedTerms(extraBeforeSignature, { ...requirementsBase, extra: extraBeforeSignature }),
  );

  const sellerSignature = await sellerWallet.signData(termsDigest);

  const extra: PaymentRequirementsExtraMasumi = {
    ...extraBeforeSignature,
    referenceKey: sellerSignature.key,
    referenceSignature: sellerSignature.signature,
  };

  return { ...requirementsBase, extra };
};
