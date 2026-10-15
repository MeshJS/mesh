/** Masumi-method rules: schema, identifier, deployment approval, buyer witness, logical replay, deadline TTL. */
import { DEFAULT_PROTOCOL_PARAMETERS } from "@meshsdk/common";
import { resolveTxHash } from "@meshsdk/core-cst";

import { unixMsToSlot } from "../../src/chain";
import { buildPaymentPayload } from "../../src/client/build";
import { signPayment } from "../../src/client/sign";
import { settlePayment } from "../../src/facilitator/settle";
import { InMemorySettlementStore } from "../../src/facilitator/store";
import { verifyPayment } from "../../src/facilitator/verify";
import {
  encodeBlockchainIdentifier,
  MASUMI_V2_REGISTRY_POLICY_ID,
} from "../../src/masumi";
import { PaymentPayload } from "../../src/types/payment-payload";
import {
  PaymentRequirements,
  PaymentRequirementsExtraMasumi,
} from "../../src/types/payment-requirements";
import { FakeFetcher, FakeSubmitter } from "../fixtures/fakes";
import { buildMasumiRequirements } from "../fixtures/masumiFixture";
import { buildTestWallet, TEST_SELLER_MNEMONIC } from "../fixtures/testWallet";

const P = DEFAULT_PROTOCOL_PARAMETERS;
const SLOT = 1_000_000;

const CUSTOM = {
  requiredAdmins: "1",
  adminVkeys: ["ab".repeat(28)],
  cooldownPeriod: "420000",
};

const setup = async (
  opts: Parameters<typeof buildMasumiRequirements>[1] = {},
  slot = SLOT,
  allow?: never,
) => {
  const fetcher = new FakeFetcher();
  const buyer = await buildTestWallet(fetcher, new FakeSubmitter());
  const seller = await buildTestWallet(
    new FakeFetcher(),
    new FakeSubmitter(),
    TEST_SELLER_MNEMONIC,
  );
  const buyerAddress = await buyer.getChangeAddress();
  fetcher.addUtxo({
    input: { txHash: "c".repeat(64), outputIndex: 0 },
    output: {
      address: buyerAddress,
      amount: [{ unit: "lovelace", quantity: "50000000" }],
    },
  });
  const requirement = await buildMasumiRequirements(seller, opts);
  const chain = {
    fetcher,
    protocol: P,
    currentSlot: slot,
    allowMasumiDeployment: allow,
  };
  return { fetcher, buyer, seller, requirement, chain, buyerAddress };
};

const buildSigned = async (s: Awaited<ReturnType<typeof setup>>) => {
  const built = await buildPaymentPayload(
    s.requirement,
    s.buyer,
    { url: "https://x.test" },
    s.chain,
  );
  return { built, signed: await signPayment(s.buyer, built) };
};

const extraOf = (r: PaymentRequirements) =>
  r.extra as PaymentRequirementsExtraMasumi;
const withExtra = (
  r: PaymentRequirements,
  patch: Record<string, unknown>,
): PaymentRequirements => ({
  ...r,
  extra: { ...r.extra, ...patch } as never,
});

describe("masumi - schema / identifier (facilitator and client agree)", () => {
  it("rejects a requirement missing blockchainIdentifier", async () => {
    const s = await setup();
    const { signed } = await buildSigned(s);
    const { blockchainIdentifier: _drop, ...rest } = extraOf(s.requirement);
    const bad = { ...s.requirement, extra: rest as never };
    expect(
      await verifyPayment(
        { ...signed, accepted: bad },
        bad,
        s.fetcher,
        P,
        SLOT,
      ),
    ).toEqual({ isValid: false, invalidReason: "MASUMI_UNKNOWN_FIELD" });
  });

  it("rejects a blockchainIdentifier that does not match the rebuilt one", async () => {
    const s = await setup();
    const { signed } = await buildSigned(s);
    const bad = withExtra(s.requirement, {
      blockchainIdentifier: encodeBlockchainIdentifier("x.y.z.w.v"),
    });
    expect(
      await verifyPayment(
        { ...signed, accepted: bad },
        bad,
        s.fetcher,
        P,
        SLOT,
      ),
    ).toEqual({ isValid: false, invalidReason: "MASUMI_INVALID_IDENTIFIER" });
  });

  it("rejects an unknown field in a closed object", async () => {
    const s = await setup();
    const { signed } = await buildSigned(s);
    const bad = withExtra(s.requirement, {
      terms: { ...extraOf(s.requirement).terms, contractAddress: "dup" },
    });
    expect(
      await verifyPayment(
        { ...signed, accepted: bad },
        bad,
        s.fetcher,
        P,
        SLOT,
      ),
    ).toEqual({ isValid: false, invalidReason: "MASUMI_UNKNOWN_FIELD" });
    const bad2 = withExtra(s.requirement, { surprise: 1 });
    expect(
      await verifyPayment(
        { ...signed, accepted: bad2 },
        bad2,
        s.fetcher,
        P,
        SLOT,
      ),
    ).toEqual({ isValid: false, invalidReason: "MASUMI_UNKNOWN_FIELD" });
  });

  it("rejects an agentIdentifier outside the Masumi V2 registry policy", async () => {
    const s = await setup();
    const { signed } = await buildSigned(s);
    const bad = withExtra(s.requirement, {
      terms: {
        ...extraOf(s.requirement).terms,
        agentIdentifier: "aa".repeat(29),
      },
    });
    expect(
      await verifyPayment(
        { ...signed, accepted: bad },
        bad,
        s.fetcher,
        P,
        SLOT,
      ),
    ).toEqual({
      isValid: false,
      invalidReason: "MASUMI_INVALID_AGENT_IDENTIFIER",
    });
    expect(MASUMI_V2_REGISTRY_POLICY_ID).toHaveLength(56);
  });

  it("rejects a tampered signed term (seller COSE no longer verifies)", async () => {
    const s = await setup();
    const { signed } = await buildSigned(s);
    const t = extraOf(s.requirement).terms!;
    const bad = withExtra(s.requirement, {
      terms: { ...t, sellerNonce: "00".repeat(32) },
    });
    expect(
      await verifyPayment(
        { ...signed, accepted: bad },
        bad,
        s.fetcher,
        P,
        SLOT,
      ),
    ).toEqual({
      isValid: false,
      invalidReason: "MASUMI_INVALID_COSE_SIGNATURE",
    });
  });
});

describe("masumi - registry claims (a non-empty agentIdentifier must be independently validated)", () => {
  const AGENT = `${MASUMI_V2_REGISTRY_POLICY_ID}01`;
  const accept = jest.fn(() => true);
  const buildWith = async (
    s: Awaited<ReturnType<typeof setup>>,
    validateRegistryClaim?: never,
  ) => {
    const built = await buildPaymentPayload(
      s.requirement,
      s.buyer,
      { url: "https://x.test/r" },
      { ...s.chain, validateRegistryClaim },
    );
    return signPayment(s.buyer, built);
  };

  it("the client refuses a registered offer without a validator, and passes the claim to one", async () => {
    const s = await setup({ agentIdentifier: AGENT });
    await expect(
      buildPaymentPayload(
        s.requirement,
        s.buyer,
        { url: "https://x.test/r" },
        s.chain,
      ),
    ).rejects.toMatchObject({
      code: "MASUMI_INVALID_AGENT_IDENTIFIER",
    });

    await buildWith(s, accept as never);
    expect(accept).toHaveBeenCalledWith({
      agentIdentifier: AGENT,
      sellerAddress: extraOf(s.requirement).terms!.sellerAddress,
      network: "cardano:preprod",
      amount: s.requirement.amount,
      asset: "lovelace",
      resource: { url: "https://x.test/r" },
    });
  });

  it("the client refuses when the validator rejects or throws", async () => {
    const s = await setup({ agentIdentifier: AGENT });
    for (const validate of [
      () => false,
      () => {
        throw new Error("registry down");
      },
      async () => false,
    ]) {
      await expect(
        buildPaymentPayload(
          s.requirement,
          s.buyer,
          { url: "https://x.test/r" },
          { ...s.chain, validateRegistryClaim: validate as never },
        ),
      ).rejects.toMatchObject({ code: "MASUMI_INVALID_AGENT_IDENTIFIER" });
    }
  });

  it("the facilitator rejects a registered claim unless a validator confirms it (fail closed)", async () => {
    const s = await setup({ agentIdentifier: AGENT });
    const signed = await buildWith(s, accept as never);
    const refused = {
      isValid: false,
      invalidReason: "MASUMI_INVALID_AGENT_IDENTIFIER",
    };

    expect(
      await verifyPayment(signed, s.requirement, s.fetcher, P, SLOT),
    ).toEqual(refused);
    expect(
      await verifyPayment(signed, s.requirement, s.fetcher, P, SLOT, {
        validateRegistryClaim: () => false,
      }),
    ).toEqual(refused);
    expect(
      await verifyPayment(signed, s.requirement, s.fetcher, P, SLOT, {
        validateRegistryClaim: () => {
          throw new Error("registry down");
        },
      }),
    ).toEqual(refused);
    expect(
      await verifyPayment(signed, s.requirement, s.fetcher, P, SLOT, {
        validateRegistryClaim: () => true,
      }),
    ).toEqual({ isValid: true });
  });

  it("unregistered sellers (empty agentIdentifier) need no validator", async () => {
    const s = await setup();
    const signed = await buildWith(s);
    expect(
      await verifyPayment(signed, s.requirement, s.fetcher, P, SLOT),
    ).toEqual({ isValid: true });
  });
});

describe("masumi - deployment approval (seller signature is not approval)", () => {
  it("client and facilitator refuse a non-default deployment unless explicitly allowed", async () => {
    const s = await setup({ deployment: CUSTOM });
    await expect(
      buildPaymentPayload(
        s.requirement,
        s.buyer,
        { url: "https://x.test" },
        s.chain,
      ),
    ).rejects.toMatchObject({ code: "MASUMI_DEPLOYMENT_NOT_ALLOWED" });

    const allow = (() => true) as never;
    const built = await buildPaymentPayload(
      s.requirement,
      s.buyer,
      { url: "https://x.test" },
      { ...s.chain, allowMasumiDeployment: allow },
    );
    const signed = await signPayment(s.buyer, built);
    expect(
      await verifyPayment(signed, s.requirement, s.fetcher, P, SLOT),
    ).toEqual({
      isValid: false,
      invalidReason: "MASUMI_DEPLOYMENT_NOT_ALLOWED",
    });
    expect(
      await verifyPayment(signed, s.requirement, s.fetcher, P, SLOT, {
        allowMasumiDeployment: allow,
      }),
    ).toEqual({ isValid: true });
  });
});

describe("masumi - buyer witness", () => {
  it("rejects a lock with no valid witness for the buyer credential", async () => {
    const s = await setup();
    const { built } = await buildSigned(s);
    const unsigned: PaymentPayload = {
      ...built,
      payload: {
        ...built.payload,
        transaction: Buffer.from(built.payload.transaction, "hex").toString(
          "base64",
        ),
      },
    };
    expect(
      await verifyPayment(unsigned, s.requirement, s.fetcher, P, SLOT),
    ).toEqual({
      isValid: false,
      invalidReason: "MASUMI_BUYER_WITNESS_MISSING",
    });
  });
});

describe("masumi - TTL vs pay_by_time", () => {
  it("client caps the lock's TTL at pay_by_time", async () => {
    const now = Date.now();
    const slot = unixMsToSlot("cardano:preprod", now);
    const s = await setup(
      { payByTimeOffsetMs: 120_000, maxTimeoutSeconds: 3000 },
      slot,
    );
    const { signed } = await buildSigned(s);
    expect(
      await verifyPayment(signed, s.requirement, s.fetcher, P, slot),
    ).toEqual({ isValid: true });
  });

  it("client refuses to lock after pay_by_time", async () => {
    const slot = unixMsToSlot("cardano:preprod", Date.now());
    const s = await setup(
      { payByTimeOffsetMs: -10_000, maxTimeoutSeconds: 3000 },
      slot,
    );
    await expect(
      buildPaymentPayload(
        s.requirement,
        s.buyer,
        { url: "https://x.test" },
        s.chain,
      ),
    ).rejects.toMatchObject({ code: "MASUMI_PAY_BY_TIME_PASSED" });
  });
});

describe("masumi - logical replay (termsDigest)", () => {
  it("a second, different transaction for the same terms is rejected before broadcast", async () => {
    const shared = new FakeFetcher();
    const buyerAddress = (
      await buildTestWallet(new FakeFetcher(), new FakeSubmitter())
    ).getChangeAddress();
    const addr = await buyerAddress;
    const mk = async (hash: string) => {
      const f = new FakeFetcher();
      const utxo = {
        input: { txHash: hash.repeat(64), outputIndex: 0 },
        output: {
          address: addr,
          amount: [{ unit: "lovelace", quantity: "50000000" }],
        },
      };
      f.addUtxo(utxo);
      shared.addUtxo(utxo);
      return {
        wallet: await buildTestWallet(f, new FakeSubmitter()),
        fetcher: f,
      };
    };
    const seller = await buildTestWallet(
      new FakeFetcher(),
      new FakeSubmitter(),
      TEST_SELLER_MNEMONIC,
    );
    const requirement = await buildMasumiRequirements(seller);

    const a = await mk("a");
    const b = await mk("b");
    const pa = await signPayment(
      a.wallet,
      await buildPaymentPayload(
        requirement,
        a.wallet,
        { url: "u" },
        { fetcher: a.fetcher, protocol: P, currentSlot: SLOT },
      ),
    );
    const pb = await signPayment(
      b.wallet,
      await buildPaymentPayload(
        requirement,
        b.wallet,
        { url: "u" },
        { fetcher: b.fetcher, protocol: P, currentSlot: SLOT },
      ),
    );
    expect(
      resolveTxHash(
        Buffer.from(pa.payload.transaction, "base64").toString("hex"),
      ),
    ).not.toBe(
      resolveTxHash(
        Buffer.from(pb.payload.transaction, "base64").toString("hex"),
      ),
    );

    const submitter = new FakeSubmitter();
    const store = new InMemorySettlementStore();
    const first = await settlePayment(
      pa,
      requirement,
      shared,
      submitter,
      store,
      P,
      SLOT,
    );
    expect(first.errorReason).toBe("settlement_pending"); // broadcast, awaiting confirmations
    const second = await settlePayment(
      pb,
      requirement,
      shared,
      submitter,
      store,
      P,
      SLOT,
    );
    expect(second.errorReason).toBe("MASUMI_TERMS_ALREADY_CLAIMED");
    expect(submitter.submitted).toHaveLength(1);
  });
});
