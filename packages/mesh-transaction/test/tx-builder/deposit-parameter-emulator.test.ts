import {
  DEFAULT_PROTOCOL_PARAMETERS,
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
  Protocol,
} from "@meshsdk/core";
import { keyHashToRewardAddress } from "@meshsdk/core-cst";

import {
  BuildEvent,
  certificate,
  output,
  TxBuilder,
  TxBuildError,
  TxError,
  TxPart,
  Utxo,
} from "../../src/tx-builder";
import { baseAddress, keyHashHex, vrfKeyHashHex } from "../test-util";
import { setup } from "./plan/plan-emulator-util";

/*
 * A certificate whose deposit or refund the protocol parameters give, when they lack it: a
 * stake registration or deregistration of the legacy form, which states no amount, takes
 * keyDeposit, and a pool's first registration poolDeposit. Each way such parameters reach a
 * build is MISSING_PARAMETER naming the field, before anything is built, never a raw error.
 */

const wallet = baseAddress(1);
const recipient = baseAddress(2);
const stake = keyHashToRewardAddress(keyHashHex(5), 0);
const costModels = [
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
];
const operator = keyHashHex(7);

let nextHash = 0;
const funds = (): Utxo => ({
  txHash: (0xd000 + ++nextHash).toString(16).padStart(64, "0"),
  outputIndex: 0,
  address: wallet,
  value: { lovelace: 5_000_000_000n },
});

/** Each certificate that takes its amount from the parameters, with the field it reads */
const CASES: [string, "keyDeposit" | "poolDeposit", () => TxPart][] = [
  [
    "legacyStakeRegistration",
    "keyDeposit",
    () => certificate.legacyStakeRegistration({ stake }),
  ],
  [
    "legacyStakeDeregistration",
    "keyDeposit",
    () => certificate.legacyStakeDeregistration({ stake }),
  ],
  [
    "poolRegistration",
    "poolDeposit",
    () =>
      certificate.poolRegistration({
        params: {
          operator,
          vrfKeyHash: vrfKeyHashHex(1),
          pledge: "1000000",
          cost: "340000000",
          margin: [1, 100],
          relays: [],
          owners: [keyHashHex(8)],
          rewardAddress: stake,
        },
      }),
  ],
];

/** The default parameters without one field */
const lacking = (field: keyof Protocol): Protocol => {
  const { [field]: _, ...rest } = DEFAULT_PROTOCOL_PARAMETERS;
  return rest as Protocol;
};

/** A provider that answers these parameters and these cost models, recording every call */
const answering = (params: Protocol) => {
  const calls: string[] = [];
  const provider = {
    fetchProtocolParameters: async () => {
      calls.push("fetchProtocolParameters");
      return params;
    },
    fetchCostModels: async () => {
      calls.push("fetchCostModels");
      return costModels;
    },
    fetchUTxOs: async () => {
      calls.push("fetchUTxOs");
      return [];
    },
    fetchAccountInfo: async () => {
      calls.push("fetchAccountInfo");
      return { active: true, balance: "0", rewards: "0", withdrawals: "0" };
    },
  };
  return { provider: provider as never, calls };
};

const caught = async (run: () => unknown): Promise<any> => {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("expected an error");
};

/** A build of the part, the events of its trace kept */
const buildOf = (builder: TxBuilder, part: TxPart, events: BuildEvent[]) =>
  builder.build(
    [part, output({ address: recipient, value: { lovelace: 2_000_000n } })],
    {
      payer: { changeAddress: wallet, utxos: [funds()] },
      trace: (event) => events.push(event),
    },
  );

/** Checks MISSING_PARAMETER for the field, of the certificate, and that nothing was priced */
const expectMissing = (
  error: unknown,
  field: string,
  events: readonly BuildEvent[],
  where: string,
) => {
  expect(error).toBeInstanceOf(TxBuildError);
  expect(TxError.is(error, "MISSING_PARAMETER")).toBe(true);
  const missing = error as TxBuildError<"MISSING_PARAMETER">;
  expect(missing.details).toEqual({ parameter: "params" });
  expect(missing.message).toContain(field);
  expect(missing.message).toContain(where);
  expect(missing.part).toBe("certificate");
  expect(events.filter((event) => event.type === "round")).toEqual([]);
};

describe("a deposit the parameters lack, named", () => {
  it.each(CASES)(
    "%s: the params option without %s is MISSING_PARAMETER, a snapshot of them too",
    async (_, field, part) => {
      const params = lacking(field);
      const events: BuildEvent[] = [];
      expectMissing(
        await caught(() =>
          buildOf(
            new TxBuilder({ network: "preprod", params }),
            part(),
            events,
          ),
        ),
        field,
        events,
        "the builder's params",
      );
      // A snapshot of a provider's parameters that lack it, spread into the options
      const snapshot = await new TxBuilder({
        network: "preprod",
        provider: answering(params).provider,
      }).chain();
      expect(snapshot.params[field]).toBeUndefined();
      expectMissing(
        await caught(() =>
          buildOf(new TxBuilder({ ...snapshot }), part(), events),
        ),
        field,
        events,
        "the builder's params",
      );
    },
  );

  it.each(CASES)(
    "%s: the provider's parameters without %s are MISSING_PARAMETER, before any UTxO is selected",
    async (_, field, part) => {
      const { provider } = answering(lacking(field));
      const events: BuildEvent[] = [];
      expectMissing(
        await caught(() =>
          buildOf(
            new TxBuilder({ network: "preprod", provider }),
            part(),
            events,
          ),
        ),
        field,
        events,
        "the provider's",
      );
    },
  );

  it.each(CASES)(
    "%s: on a builder of its network alone the build asks for the parameters themselves",
    async (_, _field, part) => {
      const events: BuildEvent[] = [];
      const error = await caught(() =>
        buildOf(new TxBuilder({ network: "preprod" }), part(), events),
      );
      expect(TxError.is(error, "MISSING_PARAMETER")).toBe(true);
      expect((error as TxBuildError<"MISSING_PARAMETER">).details).toEqual({
        parameter: "params",
      });
      expect(events).toEqual([]);
    },
  );

  it.each(CASES)(
    "%s: a plan whose provider's parameters lack the field is MISSING_PARAMETER, the step named",
    async (_, field, part) => {
      const { builder, wallet: payer } = await setup("scalus", {
        hooks: {
          fetchProtocolParameters: async (forward, ...args) => {
            const { [field]: _, ...rest } = await forward(...args);
            return rest;
          },
        },
      });
      const error = await caught(() =>
        builder.plan(
          [
            part(),
            output({ address: recipient, value: { lovelace: 2_000_000n } }),
          ],
          { payer },
        ),
      );
      expect(TxError.is(error, "MISSING_PARAMETER")).toBe(true);
      expect((error as TxBuildError<"MISSING_PARAMETER">).details).toEqual({
        parameter: "params",
      });
      expect((error as Error).message).toContain(field);
      expect((error as Error).message).toMatch(/^step "main": /);
    },
  );

  it("builds the update of a registered pool, which owes no deposit, without poolDeposit", async () => {
    const [, , pool] = CASES[2]!;
    const built = await new TxBuilder({
      network: "preprod",
      params: lacking("poolDeposit"),
    }).build(
      [pool(), output({ address: recipient, value: { lovelace: 2_000_000n } })],
      {
        payer: { changeAddress: wallet, utxos: [funds()] },
        registeredPools: [operator],
      },
    );
    expect(built.prototype.body.certs).toHaveLength(1);
  });
});
