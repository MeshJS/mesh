import { AssetTransferMethod } from "../types/payment-requirements";
import { VerifyResult } from "./verify";

export type VerificationRule = {
  id: string;
  text: string;
  codes: readonly string[];
};
export type RuleOutcome = VerificationRule & {
  status: "pass" | "fail" | "skipped";
};

/** Common rules, in the order `verifyPayment` evaluates them. */
const COMMON_RULES: VerificationRule[] = [
  {
    id: "envelope",
    text: "payload and requirements are well-formed",
    codes: ["INVALID_PAYLOAD", "INVALID_AMOUNT", "INVALID_CONFIRMATION_POLICY"],
  },
  {
    id: "trusted",
    text: "payload.accepted equals the server's own offer",
    codes: ["REQUIREMENTS_MISMATCH"],
  },
  {
    id: "network",
    text: "network matches on every output and the body",
    codes: ["INVALID_NETWORK"],
  },
  {
    id: "payto",
    text: "payTo output present with at least the amount, in exactly the asset",
    codes: ["PAYTO_NOT_FOUND", "INSUFFICIENT_AMOUNT", "ASSET_MISMATCH"],
  },
  {
    id: "nonce",
    text: "nonce is one of the tx inputs",
    codes: ["NONCE_NOT_IN_INPUTS"],
  },
  {
    id: "unspent",
    text: "every input is unspent",
    codes: ["NONCE_NOT_UNSPENT", "INPUT_NOT_UNSPENT"],
  },
  {
    id: "features",
    text: "no mint / withdrawals / certs / governance",
    codes: ["UNSUPPORTED_TX_FEATURE"],
  },
  {
    id: "value",
    text: "value conserved, fee above minimum",
    codes: ["VALUE_NOT_CONSERVED", "FEE_TOO_LOW"],
  },
  {
    id: "ttl",
    text: "TTL not expired, not beyond maxTimeoutSeconds",
    codes: ["TTL_EXPIRED", "TTL_TOO_FAR"],
  },
  { id: "minutxo", text: "min-UTxO satisfied", codes: ["BELOW_MIN_UTXO"] },
];

const METHOD_RULES: Record<AssetTransferMethod, VerificationRule[]> = {
  default: [],
  script: [
    {
      id: "script",
      text: "payTo is the declared script's address; no V1 script with inline datum",
      codes: [
        "SCRIPT_ADDRESS_MISMATCH",
        "SCRIPT_DATUM_NOT_INLINE",
        "SCRIPT_DATUM_MISMATCH",
        "SCRIPT_INVALID",
        "SCRIPT_V1_WITH_DATUM",
      ],
    },
  ],
  masumi: [
    {
      id: "masumi",
      text: "Masumi terms, seller signature, escrow address, datum and buyer witness",
      codes: [],
    },
  ],
};

/** The ordered rule list a facilitator applies for `method`. */
export const verificationRules = (
  method: AssetTransferMethod = "default",
): VerificationRule[] => [...COMMON_RULES, ...METHOD_RULES[method]];

/**
 * Per-rule outcome of a `verifyPayment` result. `verifyPayment` stops at the first failing rule, so
 * every rule before the failing one passed and every rule after it was not evaluated.
 */
export const explainVerification = (
  method: AssetTransferMethod,
  result: VerifyResult,
): RuleOutcome[] => {
  const rules = verificationRules(method);
  if (result.isValid)
    return rules.map((r) => ({ ...r, status: "pass" as const }));
  const code = result.invalidReason;
  let failing = rules.findIndex(
    (r) =>
      r.codes.includes(code) ||
      (r.id === "masumi" && code.startsWith("MASUMI_")),
  );
  if (failing < 0) failing = rules.length - 1;
  return rules.map((r, i) => ({
    ...r,
    status:
      i < failing
        ? ("pass" as const)
        : i === failing
          ? ("fail" as const)
          : ("skipped" as const),
  }));
};
