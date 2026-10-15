/** Facilitator rules 1-8 and the payload envelope, one test per spec discrepancy that was fixed. */
import { DEFAULT_PROTOCOL_PARAMETERS } from "@meshsdk/common";
import { ForgeScript, resolveScriptHash } from "@meshsdk/core";
import { MeshTxBuilder } from "@meshsdk/transaction";

import { buildPaymentPayload } from "../../src/client/build";
import { signPayment } from "../../src/client/sign";
import { verifyPayment } from "../../src/facilitator/verify";
import { PaymentPayload } from "../../src/types/payment-payload";
import { PaymentRequirements } from "../../src/types/payment-requirements";
import { FakeFetcher, FakeSubmitter } from "../fixtures/fakes";
import { buildTestWallet } from "../fixtures/testWallet";

const SELLER =
  "addr_test1qpu5vlrf4xkxv2qpwngf6cjhtw542ayty80v8dyr49rf5ewvxwdrt70qlcpeeagscasafhffqsxy36t90ldv06wqrk2qum8x5w";
const SLOT = 1_000_000;
const P = DEFAULT_PROTOCOL_PARAMETERS;

const baseRequirement = (
  extra: Partial<PaymentRequirements> = {},
): PaymentRequirements => ({
  scheme: "exact",
  network: "cardano:preprod",
  amount: "2000000",
  asset: "lovelace",
  payTo: SELLER,
  maxTimeoutSeconds: 300,
  extra: { confirmationPolicy: { l1Confirmations: 1 } },
  ...extra,
});

const setup = async (requirement = baseRequirement(), utxoCount = 1) => {
  const fetcher = new FakeFetcher();
  const wallet = await buildTestWallet(fetcher, new FakeSubmitter());
  const buyer = await wallet.getChangeAddress();
  for (let i = 0; i < utxoCount; i++) {
    fetcher.addUtxo({
      input: { txHash: String(i + 1).repeat(64), outputIndex: 0 },
      output: {
        address: buyer,
        amount: [{ unit: "lovelace", quantity: "50000000" }],
      },
    });
  }
  const built = await buildPaymentPayload(
    requirement,
    wallet,
    { url: "https://x.test" },
    { fetcher, protocol: P, currentSlot: SLOT },
  );
  const payload = await signPayment(wallet, built);
  return { fetcher, wallet, buyer, payload, requirement };
};

describe("rule 5 - nonce / every input", () => {
  it("rejects a nonce that is not an input of the transaction", async () => {
    const { fetcher, payload, requirement } = await setup();
    const forged: PaymentPayload = {
      ...payload,
      payload: { ...payload.payload, nonce: `${"9".repeat(64)}#0` },
    };
    fetcher.addUtxo({
      input: { txHash: "9".repeat(64), outputIndex: 0 },
      output: {
        address: SELLER,
        amount: [{ unit: "lovelace", quantity: "5000000" }],
      },
    });
    expect(await verifyPayment(forged, requirement, fetcher, P, SLOT)).toEqual({
      isValid: false,
      invalidReason: "NONCE_NOT_IN_INPUTS",
    });
  });

  it("rejects a malformed nonce", async () => {
    const { fetcher, payload, requirement } = await setup();
    const forged: PaymentPayload = {
      ...payload,
      payload: { ...payload.payload, nonce: "nope" },
    };
    expect(await verifyPayment(forged, requirement, fetcher, P, SLOT)).toEqual({
      isValid: false,
      invalidReason: "NONCE_NOT_IN_INPUTS",
    });
  });

  it("rejects when a NON-nonce input is already spent", async () => {
    const { fetcher, payload, requirement } = await setup(
      baseRequirement({ amount: "60000000" }),
      2,
    );
    const inputs = ["1", "2"].map((c) => `${c.repeat(64)}#0`);
    const other = inputs.find((i) => i !== payload.payload.nonce)!;
    const [hash, idx] = other.split("#");
    fetcher.spend(hash!, Number(idx));
    expect(await verifyPayment(payload, requirement, fetcher, P, SLOT)).toEqual(
      { isValid: false, invalidReason: "INPUT_NOT_UNSPENT" },
    );
  });
});

describe("rule 6 - unexplained value movement", () => {
  it("rejects a transaction that mints", async () => {
    const { fetcher, wallet, buyer, requirement } = await setup();
    const utxos = await wallet.getUtxos();
    const forgeScript = ForgeScript.withOneSignature(buyer);
    const hash = resolveScriptHash(forgeScript);
    const tx = new MeshTxBuilder({ fetcher });
    tx.txOut(SELLER, [{ unit: "lovelace", quantity: "2000000" }])
      .mint("1", hash, "")
      .mintingScript(forgeScript)
      .changeAddress(buyer)
      .selectUtxosFrom(utxos)
      .invalidHereafter(SLOT + 200);
    const unsigned = await tx.complete();
    const nonceInput = `${utxos[0]!.input.txHash}#${utxos[0]!.input.outputIndex}`;
    const signed = await wallet.signTx(unsigned, false, true);
    const payload: PaymentPayload = {
      x402Version: 2,
      resource: { url: "https://x.test" },
      accepted: requirement,
      payload: {
        transaction: Buffer.from(signed, "hex").toString("base64"),
        nonce: nonceInput,
      },
    };
    expect(await verifyPayment(payload, requirement, fetcher, P, SLOT)).toEqual(
      { isValid: false, invalidReason: "UNSUPPORTED_TX_FEATURE" },
    );
  });
});

describe("rule 7 - TTL window", () => {
  it("accepts a client-built payment even when the facilitator's slot is slightly later", async () => {
    const { fetcher, payload, requirement } = await setup();
    expect(
      await verifyPayment(payload, requirement, fetcher, P, SLOT + 20),
    ).toEqual({ isValid: true });
  });

  it("client TTL stays inside maxTimeoutSeconds (never TTL_TOO_FAR at build time)", async () => {
    const { fetcher, payload, requirement } = await setup(
      baseRequirement({ maxTimeoutSeconds: 60 }),
    );
    expect(await verifyPayment(payload, requirement, fetcher, P, SLOT)).toEqual(
      { isValid: true },
    );
  });
});

describe("rule 1 - network", () => {
  it("accepts a CIP-34 alias for the canonical network", async () => {
    const { fetcher, payload, requirement } = await setup();
    // preprod is cip34:0-1; the resource server issued the alias, the client echoed the canonical id.
    const aliased = { ...requirement, network: "cip34:0-1" as never };
    expect(await verifyPayment(payload, aliased, fetcher, P, SLOT)).toEqual({
      isValid: true,
    });
  });

  it("rejects an unknown network identifier without throwing", async () => {
    const { fetcher, payload, requirement } = await setup();
    const bad = {
      ...payload,
      accepted: { ...payload.accepted, network: "cardano:nope" as never },
    };
    const r = await verifyPayment(
      bad,
      { ...requirement, network: "cardano:nope" as never },
      fetcher,
      P,
      SLOT,
    );
    expect(r).toEqual({ isValid: false, invalidReason: "INVALID_NETWORK" });
  });
});

describe("envelope validation (never throws)", () => {
  it("rejects garbage base64/CBOR as INVALID_PAYLOAD", async () => {
    const { fetcher, payload, requirement } = await setup();
    const bad = {
      ...payload,
      payload: { ...payload.payload, transaction: "bm90IGEgdHg=" },
    };
    expect(await verifyPayment(bad, requirement, fetcher, P, SLOT)).toEqual({
      isValid: false,
      invalidReason: "INVALID_PAYLOAD",
    });
  });

  it("rejects a non-canonical amount", async () => {
    const { fetcher, payload, requirement } = await setup();
    const bad = { ...requirement, amount: "0x10" };
    expect(
      await verifyPayment({ ...payload, accepted: bad }, bad, fetcher, P, SLOT),
    ).toEqual({ isValid: false, invalidReason: "INVALID_AMOUNT" });
  });

  it("rejects an out-of-range confirmation policy, and accepts an absent one (defaults to 1)", async () => {
    const { fetcher, payload, requirement } = await setup();
    const tooMany = {
      ...requirement,
      extra: { confirmationPolicy: { l1Confirmations: 21 } },
    };
    expect(
      await verifyPayment(
        { ...payload, accepted: tooMany },
        tooMany,
        fetcher,
        P,
        SLOT,
      ),
    ).toEqual({ isValid: false, invalidReason: "INVALID_CONFIRMATION_POLICY" });

    const absent = { ...requirement, extra: {} };
    const s = await setup(absent);
    expect(await verifyPayment(s.payload, absent, s.fetcher, P, SLOT)).toEqual({
      isValid: true,
    });
  });

  it("refuses l1Confirmations=-1 unless the facilitator opted in (advertised minimum 0)", async () => {
    const req = baseRequirement({
      extra: { confirmationPolicy: { l1Confirmations: -1 } },
    });
    const s = await setup(req);
    expect(await verifyPayment(s.payload, req, s.fetcher, P, SLOT)).toEqual({
      isValid: false,
      invalidReason: "INVALID_CONFIRMATION_POLICY",
    });
    expect(
      await verifyPayment(s.payload, req, s.fetcher, P, SLOT, {
        l1Confirmations: { minimum: -1, maximum: 20 },
      }),
    ).toEqual({ isValid: true });
  });

  it("rejects areFeesSponsored: true", async () => {
    const req = baseRequirement({
      extra: {
        confirmationPolicy: { l1Confirmations: 1 },
        areFeesSponsored: true as never,
      },
    });
    const s = await setup(req);
    expect(await verifyPayment(s.payload, req, s.fetcher, P, SLOT)).toEqual({
      isValid: false,
      invalidReason: "INVALID_PAYLOAD",
    });
  });
});
