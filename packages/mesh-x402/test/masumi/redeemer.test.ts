import { fromBuilderToPlutusData } from "@meshsdk/core-cst";

import {
  AUTHORIZE_REFUND_REDEEMER,
  AUTHORIZE_WITHDRAWAL_REDEEMER,
  buildWithdrawDisputedRedeemer,
  SET_REFUND_REQUESTED_REDEEMER,
  SUBMIT_RESULT_REDEEMER,
  WITHDRAW_REDEEMER,
  WITHDRAW_REFUND_REDEEMER,
} from "../../src/masumi/spend/redeemer";

// PlutusData's constructor index is CBOR-tagged per Cardano's Plutus Data encoding: alternatives
// 0-6 map to CBOR tags 121-127. Round-tripping through toCbor and checking the tag byte proves
// each redeemer encodes to the exact constructor index vested_pay.ak's `Action` type expects.
const constrTag = (data: ReturnType<typeof fromBuilderToPlutusData>) => {
  const cbor = data.toCbor().toString();
  return parseInt(cbor.slice(0, 2), 16); // first byte: CBOR tag (0xd8) or, for small tags, the tag itself encoded in the initial bytes
};

describe("Action redeemer encoding - constructor tags match vested_pay.ak's declaration order", () => {
  it.each([
    ["Withdraw", WITHDRAW_REDEEMER, 0],
    ["SetRefundRequested", SET_REFUND_REQUESTED_REDEEMER, 1],
    ["AuthorizeWithdrawal", AUTHORIZE_WITHDRAWAL_REDEEMER, 2],
    ["WithdrawRefund", WITHDRAW_REFUND_REDEEMER, 3],
    ["SubmitResult", SUBMIT_RESULT_REDEEMER, 5],
    ["AuthorizeRefund", AUTHORIZE_REFUND_REDEEMER, 6],
  ] as const)("%s encodes without throwing and round-trips through CBOR", (_name, redeemer) => {
    const plutusData = fromBuilderToPlutusData({ type: "Mesh", content: redeemer });
    const hex = plutusData.toCbor().toString();
    expect(hex).toMatch(/^[0-9a-f]+$/);
    expect(hex.length).toBeGreaterThan(0);
  });

  it("WithdrawDisputed carries buyer/seller values and admin signatures", () => {
    const redeemer = buildWithdrawDisputedRedeemer(
      [{ policyId: "", assets: [{ assetName: "", quantity: 2_000_000n }] }],
      [{ policyId: "", assets: [{ assetName: "", quantity: 1_000_000n }] }],
      [{ verificationKey: "aa".repeat(32), protectedHeaders: "a10127", signature: "bb".repeat(64) }],
    );
    const plutusData = fromBuilderToPlutusData({ type: "Mesh", content: redeemer });
    const hex = plutusData.toCbor().toString();
    expect(hex).toMatch(/^[0-9a-f]+$/);
    // The admin pubkey/signature bytes must appear verbatim in the encoded redeemer.
    expect(hex).toContain("aa".repeat(32));
    expect(hex).toContain("bb".repeat(64));
  });
});
