import { mConStr0 } from "@meshsdk/common";
import { applyEncoding, fromBuilderToPlutusData } from "@meshsdk/core-cst";

import { validateMasumiRequirementsFull } from "../../src/masumi/validate";
import { scriptPayToMatches } from "../../src/script";
import {
  buildDefaultOffer,
  buildMasumiOffer,
  buildScriptOffer,
  masumiTermsDigestOf,
} from "../../src/server/offers";
import { PaymentRequirementsExtraMasumi } from "../../src/types/payment-requirements";
import { buildTestWallet } from "../fixtures/testWallet";

const RAW =
  "58340101002332259800a518a4d153300249011856616c696461746f722072657475726e65642066616c736500136564004ae715cd01";

describe("server offers", () => {
  it("builds a default offer", () => {
    const o = buildDefaultOffer({
      network: "cardano:preprod",
      amount: "2000000",
      payTo: "addr_test1x",
    });
    expect(o.extra).toEqual({ confirmationPolicy: { l1Confirmations: 1 } });
  });

  it("builds a script offer whose payTo is the script address", () => {
    const code = Buffer.from(
      applyEncoding(Buffer.from(RAW, "hex"), "SingleCBOR"),
    ).toString("hex");
    const o = buildScriptOffer({
      network: "cardano:preprod",
      amount: "2000000",
      script: { type: "plutusV3", code },
      datum: fromBuilderToPlutusData({ type: "Mesh", content: mConStr0([]) })
        .toCbor()
        .toString(),
    });
    expect(scriptPayToMatches(o.extra as never, o.payTo)).toBe(true);
  });

  it("builds a masumi offer that passes the client's full validation", async () => {
    const seller = await buildTestWallet();
    const { requirements, termsDigest } = await buildMasumiOffer({
      network: "cardano:preprod",
      amount: "2000000",
      sellerWallet: seller,
      sellerAddress: await seller.getChangeAddress(),
      jobInput: { job: "x" },
    });
    expect(await validateMasumiRequirementsFull(requirements)).toBeNull();
    expect(masumiTermsDigestOf(requirements)).toBe(termsDigest);
  });

  it("masumi offers meet the spec's issuance rules and use an empty buyerNonce by default", async () => {
    const seller = await buildTestWallet();
    const before = Date.now();
    const { requirements } = await buildMasumiOffer({
      network: "cardano:preprod",
      amount: "2000000",
      sellerWallet: seller,
      sellerAddress: await seller.getChangeAddress(),
      jobInput: { job: "x" },
    });
    const after = Date.now();
    const terms = (requirements.extra as PaymentRequirementsExtraMasumi).terms!;
    // pay_by_time: in the future and not beyond issuance + maxTimeoutSeconds; submit_result_time >= 15 min out.
    expect(Number(terms.payByTime)).toBeGreaterThan(after);
    expect(Number(terms.payByTime)).toBeLessThanOrEqual(
      after + requirements.maxTimeoutSeconds * 1000,
    );
    expect(Number(terms.submitResultTime)).toBeGreaterThanOrEqual(
      before + 15 * 60 * 1000,
    );
    expect(terms.buyerNonce).toBe("");
  });

  it("refuses a payByOffsetMs beyond maxTimeoutSeconds, and an invalid buyerNonce", async () => {
    const seller = await buildTestWallet();
    const params = {
      network: "cardano:preprod" as const,
      amount: "2000000",
      sellerWallet: seller,
      sellerAddress: await seller.getChangeAddress(),
      jobInput: {},
    };
    await expect(
      buildMasumiOffer({ ...params, payByOffsetMs: 3_600_000 }),
    ).rejects.toMatchObject({
      code: "MASUMI_INVALID_DEADLINE_ORDERING",
    });
    await expect(
      buildMasumiOffer({ ...params, buyerNonce: "zz" }),
    ).rejects.toMatchObject({ code: "MASUMI_INVALID_FIELD" });
    const ok = await buildMasumiOffer({
      ...params,
      buyerNonce: "01020304050607",
    });
    expect(
      (ok.requirements.extra as PaymentRequirementsExtraMasumi).terms!
        .buyerNonce,
    ).toBe("01020304050607");
  });
});
