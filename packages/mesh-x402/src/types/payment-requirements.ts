import { CardanoNetwork } from "./network";

export type AssetTransferMethod = "default" | "masumi" | "script";

export type ConfirmationPolicy = {
  /** -1 (facilitator's own broadcast acceptance) .. 20 canonical block confirmations. Default 1. */
  l1Confirmations: number;
};

export type InputCommitmentPart = {
  name: string;
  canonicalization: "jcs" | "raw";
  mediaType?: string;
  content: unknown;
  digest: string;
};

export type InputCommitment = {
  version: "1";
  algorithm: "sha256";
  parts: InputCommitmentPart[];
  digest: string;
};

export type MasumiTerms = {
  version: "1";
  paymentType: "Web3CardanoV2";
  sellerAddress: string;
  sellerReturnAddress?: string;
  sellerNonce: string;
  buyerNonce: string;
  agentIdentifier?: string;
  inputHash: string;
  /** POSIX milliseconds, as strings. */
  payByTime: string;
  submitResultTime: string;
  unlockTime: string;
  externalDisputeUnlockTime: string;
};

export type MasumiDeployment = {
  /** Decimal string, per spec (e.g. `"2"`). */
  requiredAdmins: string;
  /** 28-byte key hashes, hex. */
  adminVkeys: string[];
  /** Decimal string, in slots (e.g. `"420000"`). */
  cooldownPeriod: string;
};

export type PlutusScriptCode = {
  type: "plutusV1" | "plutusV2" | "plutusV3";
  code: string;
};

export type ScriptParameter = { value: unknown; type: string };

export type PaymentRequirementsExtraBase = {
  confirmationPolicy: ConfirmationPolicy;
};

export type PaymentRequirementsExtraDefault = PaymentRequirementsExtraBase & {
  assetTransferMethod?: "default";
};

export type PaymentRequirementsExtraMasumi = PaymentRequirementsExtraBase & {
  assetTransferMethod: "masumi";
  inputCommitment?: InputCommitment;
  terms?: MasumiTerms;
  referenceKey?: string;
  referenceSignature?: string;
  blockchainIdentifier?: string;
  deployment?: MasumiDeployment;
};

export type PaymentRequirementsExtraScript = PaymentRequirementsExtraBase & {
  assetTransferMethod: "script";
  scriptHash?: string;
  script?: PlutusScriptCode;
  parameters?: Record<string, ScriptParameter>;
  datum?: string;
};

export type PaymentRequirementsExtra =
  | PaymentRequirementsExtraDefault
  | PaymentRequirementsExtraMasumi
  | PaymentRequirementsExtraScript;

export type PaymentRequirements = {
  scheme: "exact";
  network: CardanoNetwork;
  /** Atomic units, decimal string. */
  amount: string;
  /** `"lovelace"` or `"policyId.assetNameHex"`. */
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: PaymentRequirementsExtra;
};

export const getAssetTransferMethod = (
  requirement: PaymentRequirements,
): AssetTransferMethod => requirement.extra.assetTransferMethod ?? "default";

export type ResourceInfo = {
  url: string;
  description?: string;
  mimeType?: string;
};

/** The shape of a 402 response body (V2). */
export type X402ChallengeResponse = {
  x402Version: 2;
  error?: string;
  resource?: ResourceInfo;
  accepts: PaymentRequirements[];
};
