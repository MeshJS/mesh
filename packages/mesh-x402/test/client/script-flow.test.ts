import { DEFAULT_PROTOCOL_PARAMETERS, mConStr0 } from "@meshsdk/common";
import { applyEncoding, fromBuilderToPlutusData } from "@meshsdk/core-cst";

import { buildPaymentPayload } from "../../src/client/build";
import { signPayment } from "../../src/client/sign";
import { verifyPayment } from "../../src/facilitator/verify";
import { resolveScriptAddress } from "../../src/script";
import { PaymentRequirements } from "../../src/types/payment-requirements";
import { FakeFetcher, FakeSubmitter } from "../fixtures/fakes";
import { buildTestWallet } from "../fixtures/testWallet";

// A minimal always-succeeds Plutus V3 validator, used only to exercise the `script` method's
// address derivation/attachment plumbing - its spending logic is irrelevant here since this
// package never submits the tx on-chain in a unit test.
const ALWAYS_SUCCEED_RAW_HEX =
  "58340101002332259800a518a4d153300249011856616c696461746f722072657475726e65642066616c736500136564004ae715cd01";
const alwaysSucceedCbor = Buffer.from(
  applyEncoding(Buffer.from(ALWAYS_SUCCEED_RAW_HEX, "hex"), "SingleCBOR"),
).toString("hex");

// A second, distinct compiled script (different bytes -> different hash/address), used only
// to prove the facilitator independently re-derives the script address rather than trusting
// whatever `extra.script` a payload claims.
const ALWAYS_FAIL_RAW_HEX = "5001010023259800b452689b2b20025735";
const alwaysFailCbor = Buffer.from(
  applyEncoding(Buffer.from(ALWAYS_FAIL_RAW_HEX, "hex"), "SingleCBOR"),
).toString("hex");

describe("script assetTransferMethod - end to end (build -> sign -> verify)", () => {
  it("builds a valid, verifiable script-locked payment", async () => {
    const fetcher = new FakeFetcher();
    const submitter = new FakeSubmitter();
    const wallet = await buildTestWallet(fetcher, submitter);
    const buyerAddress = await wallet.getChangeAddress();

    fetcher.addUtxo({
      input: { txHash: "f".repeat(64), outputIndex: 0 },
      output: { address: buyerAddress, amount: [{ unit: "lovelace", quantity: "50000000" }] },
    });

    const extra = {
      assetTransferMethod: "script" as const,
      confirmationPolicy: { l1Confirmations: 1 },
      script: { type: "plutusV3" as const, code: alwaysSucceedCbor },
      datum: fromBuilderToPlutusData({ type: "Mesh", content: mConStr0([]) }).toCbor().toString(),
    };
    const scriptAddress = resolveScriptAddress(extra, "cardano:preprod");

    const requirement: PaymentRequirements = {
      scheme: "exact",
      network: "cardano:preprod",
      amount: "2000000",
      asset: "lovelace",
      payTo: scriptAddress,
      maxTimeoutSeconds: 300,
      extra,
    };

    const currentSlot = 1_000_000;
    const built = await buildPaymentPayload(
      requirement,
      wallet,
      { url: "https://example.com/resource" },
      { fetcher, protocol: DEFAULT_PROTOCOL_PARAMETERS, currentSlot },
    );
    const signed = await signPayment(wallet, built);

    const result = await verifyPayment(signed, requirement, fetcher, DEFAULT_PROTOCOL_PARAMETERS, currentSlot);
    expect(result).toEqual({ isValid: true });
  });

  it("rejects a payload whose declared `extra.script` doesn't actually derive to `payTo` (no `scriptHash` present)", async () => {
    // Regression test: the facilitator must independently derive the script address from
    // `extra.script` whenever it's declared, not only when `extra.scriptHash` is also
    // present. Builds a legitimate payment to `alwaysSucceedCbor`'s address, then has the
    // payload claim (falsely) that `extra.script` is a different, unrelated compiled script.
    const fetcher = new FakeFetcher();
    const submitter = new FakeSubmitter();
    const wallet = await buildTestWallet(fetcher, submitter);
    const buyerAddress = await wallet.getChangeAddress();

    fetcher.addUtxo({
      input: { txHash: "9".repeat(64), outputIndex: 0 },
      output: { address: buyerAddress, amount: [{ unit: "lovelace", quantity: "50000000" }] },
    });

    const extra = {
      assetTransferMethod: "script" as const,
      confirmationPolicy: { l1Confirmations: 1 },
      script: { type: "plutusV3" as const, code: alwaysSucceedCbor },
      datum: fromBuilderToPlutusData({ type: "Mesh", content: mConStr0([]) }).toCbor().toString(),
    };
    const scriptAddress = resolveScriptAddress(extra, "cardano:preprod");

    const requirement: PaymentRequirements = {
      scheme: "exact",
      network: "cardano:preprod",
      amount: "2000000",
      asset: "lovelace",
      payTo: scriptAddress,
      maxTimeoutSeconds: 300,
      extra,
    };

    const currentSlot = 1_000_000;
    const built = await buildPaymentPayload(
      requirement,
      wallet,
      { url: "https://example.com/resource" },
      { fetcher, protocol: DEFAULT_PROTOCOL_PARAMETERS, currentSlot },
    );
    const signed = await signPayment(wallet, built);

    // The tx still pays `scriptAddress` (so rules 2-4 pass); only the declared script now
    // disagrees with it, so the mismatch must be caught by the script-method-specific check.
    const mismatchedExtra = { ...extra, script: { type: "plutusV3" as const, code: alwaysFailCbor } };
    const mismatchedRequirement = { ...requirement, extra: mismatchedExtra };
    const mismatchedPayload = { ...signed, accepted: mismatchedRequirement };

    const result = await verifyPayment(
      mismatchedPayload,
      mismatchedRequirement,
      fetcher,
      DEFAULT_PROTOCOL_PARAMETERS,
      currentSlot,
    );
    expect(result).toEqual({ isValid: false, invalidReason: "SCRIPT_ADDRESS_MISMATCH" });
  });
});
