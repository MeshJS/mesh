import type { MeshWallet } from "@meshsdk/wallet";
import { deserializeAddress, mConStr0 } from "@meshsdk/core";
import { Crypto, resolvePlutusScriptAddress } from "@meshsdk/core-cst";

import type {
  BuiltTx,
  PlanSteps,
  SpendPubKeyParams,
  TxStep,
} from "../../../src/tx-builder";
import type { TxPlan } from "../../../src/tx-builder/plan/plan";
import {
  collateral,
  collateralReturn,
  output,
  signedKeyHashes,
  spend,
  TxBuilder,
  TxBuildError,
  TxPlanError,
  validity,
} from "../../../src/tx-builder";
import { readPlan } from "../../../src/tx-builder/plan/json";
import { recordOf } from "../../../src/tx-builder/plan/plan";
import { alwaysSucceedCbor } from "../../test-util";
import {
  arr,
  bytes,
  map,
  mapPairs,
  tag258,
  topItems,
  txHashOf,
  tx as txOf,
  uint,
  vkeyWitness,
  witnessEntry,
} from "../cbor-util";
import { keysSigner, testKey } from "../hash-signer-util";
import {
  advance,
  builderOf,
  caught,
  emulatorOf,
  forwarding,
  hashOf,
  walletOf,
  wrap,
} from "./plan-emulator-util";
import { ADA, alice, bob, carol, paidTo, payTo, stepSetup } from "./run-util";
import { storeSetup } from "./store-util";

// A step of a plan given as a transaction built before: an object of `build`, `fromCbor` or
// `restore`, or its CBOR. It is read from its own bytes, signed as a step the plan built, and no
// other step spends or selects what it spends.

const LONG = 120_000;

/** An out ref as text */
const ref = (u: { txHash: string; outputIndex: number }) =>
  `${u.txHash}#${u.outputIndex}`;

const statuses = (plan: TxPlan) =>
  Object.fromEntries(plan.steps.map((step) => [step.name, step.status]));

/** The calls of a provider, all methods together */
const allCalls = (calls: Record<string, number>) =>
  Object.values(calls).reduce((sum, n) => sum + n, 0);

/**
 * A payer over a wallet that records the hash of every body it is handed to sign, by any of the
 * wallet's signing methods: the same wallet, signing as it does
 */
const recording = (wallet: MeshWallet) => {
  const seen: string[] = [];
  const payer = Object.create(wallet) as MeshWallet;
  const methods = payer as unknown as Record<string, unknown>;
  const own = wallet as unknown as Record<
    string,
    (tx: string, ...rest: unknown[]) => Promise<unknown>
  >;
  for (const name of ["signTx", "signTxWitnesses"])
    if (typeof own[name] === "function")
      methods[name] = async (tx: string, ...rest: unknown[]) => {
        seen.push(await hashOf(tx));
        return own[name]!.call(wallet, tx, ...rest);
      };
  return { payer, seen };
};

/**
 * An emulator, the plan's builder and wallet, and a partner: another wallet, funded, with a
 * builder of its own over the same chain
 */
const setup = async (
  options: { funds?: bigint[]; partnerFunds?: bigint } = {},
) => {
  const ctx = await stepSetup("scalus", {
    funds: options.funds ?? [1000n * ADA, 20n * ADA],
  });
  const partner = await walletOf(1);
  const partnerAddress = (await partner.getChangeAddress())!;
  ctx.emulator.fund(partnerAddress, {
    lovelace: options.partnerFunds ?? 100n * ADA,
  });
  const partnerBuilder = builderOf(wrap(ctx.emulator), {
    evaluator: ctx.emulator,
  });
  const walletKey = deserializeAddress(ctx.address).pubKeyHash;
  return { ...ctx, partner, partnerAddress, partnerBuilder, walletKey };
};

type Ctx = Awaited<ReturnType<typeof setup>>;

/** A deposit of 10 ada to the wallet's own address, labelled, built and signed by the wallet */
const deposit = async (
  ctx: Ctx,
  extra: Parameters<TxBuilder["build"]>[0] = [],
) => {
  const fund = await ctx.builder.build(
    [
      output({
        address: ctx.address,
        value: { lovelace: 10n * ADA },
        label: "deposit",
      }),
      extra,
    ],
    { payer: ctx.wallet },
  );
  await fund.sign();
  return fund;
};

/**
 * The partner's transaction on the deposit and a UTxO of its own: it pays the wallet 12 ada, and
 * the partner signs it; the wallet's key is left to sign
 */
const partnerSwap = async (ctx: Ctx, fund: BuiltTx, lovelace = 12n * ADA) => {
  const swap = await ctx.partnerBuilder.build(
    [
      spend.pubKey({ utxo: fund.outputs[0]! }),
      output({ address: ctx.address, value: { lovelace } }),
    ],
    { payer: ctx.partner },
  );
  await swap.sign();
  return swap.partialTx;
};

/** A transaction of the partner that spends a UTxO of the wallet and pays the partner */
const takesFromWallet = async (
  ctx: Ctx,
  utxo: SpendPubKeyParams["utxo"],
  lovelace = 15n * ADA,
) => {
  const swap = await ctx.partnerBuilder.build(
    [
      spend.pubKey({ utxo }),
      output({ address: ctx.partnerAddress, value: { lovelace } }),
    ],
    { payer: ctx.partner },
  );
  await swap.sign();
  return swap.partialTx;
};

/** A transaction of the partner's own UTxOs, fully signed, paying an address */
const partnerPays = async (
  ctx: Ctx,
  address: string,
  lovelace: bigint,
  more: Parameters<TxBuilder["build"]>[0] = [],
) => {
  const built = await ctx.partnerBuilder.build(
    [output({ address, value: { lovelace } }), more],
    { payer: ctx.partner },
  );
  await built.sign();
  return built;
};

const expectSteps = (error: unknown, message?: RegExp) => {
  expect(TxBuildError.is(error, "INVALID_OPTION")).toBe(true);
  expect((error as TxBuildError).details).toMatchObject({ option: "steps" });
  if (message !== undefined) expect((error as Error).message).toMatch(message);
};

/** The codes of a step's warnings */
const codes = (step: TxStep) => step.warnings.map((w) => w.code);

describe("a transaction built before as a step of a plan", () => {
  it(
    "runs a deposit built before, a partner's transaction and a payout",
    async () => {
      const ctx = await setup();
      const fund = await deposit(ctx);
      const partnerCbor = await partnerSwap(ctx, fund);
      const swap = await ctx.builder.fromCbor(partnerCbor, {
        knownUtxos: fund.outputs,
      });
      await swap.sign({ signers: ctx.wallet });
      expect(swap.missing).toEqual([]);
      const { payer, seen } = recording(ctx.wallet);
      const plan = await ctx.builder.plan(
        {
          fund,
          swap,
          payout: [
            spend.pubKey({ utxo: { step: "swap", output: 0 } }),
            payTo(carol, 4n * ADA),
          ],
        },
        { payer },
      );
      expect(plan.steps.map((step) => [step.name, step.kind])).toEqual([
        ["fund", "prebuilt"],
        ["swap", "prebuilt"],
        ["payout", undefined],
      ]);
      expect(statuses(plan)).toEqual({
        fund: "signed",
        swap: "signed",
        payout: "built",
      });
      expect(plan.step("swap").standsOn).toEqual(["fund"]);
      expect(plan.step("payout").standsOn).toEqual(["fund", "swap"]);
      // The deposit swap spends is not on chain: it came from fund's own transaction
      expect(
        ctx.emulator.utxos({ address: ctx.address }).map((u) => ref(u.input)),
      ).not.toContain(ref(fund.outputs[0]!));
      expect(plan.step("swap").inputs.map(ref)).toContain(
        ref(fund.outputs[0]!),
      );
      expect(codes(plan.step("fund"))).toContain("NEVER_EXPIRES");
      expect(codes(plan.step("swap"))).toContain("NEVER_EXPIRES");
      expect(plan.until).toBeUndefined();
      expect(plan.fee).toBe(fund.fee + swap.fee + plan.step("payout").fee);
      // The labels and the change of the object come with it
      expect(plan.step("fund").outputs[0]!.label).toBe("deposit");
      expect(plan.step("fund").change.map(ref)).toEqual(fund.change.map(ref));
      expect(plan.step("swap").change).toEqual([]);

      await plan.run();
      expect(plan.status).toBe("final");
      expect(paidTo(ctx.emulator, carol)).toEqual([4n * ADA]);
      // The plan handed the payer the body it built, and no other
      expect(seen).toEqual([plan.step("payout").txHash]);
    },
    LONG,
  );

  it(
    "takes the partner's transaction as CBOR; a signer with no key it needs gives nothing, and addWitnesses signs it",
    async () => {
      await Crypto.ready();
      const ctx = await setup();
      const fund = await deposit(ctx);
      const partnerCbor = await partnerSwap(ctx, fund);
      const plan = await ctx.builder.plan(
        {
          fund,
          swap: partnerCbor,
          payout: [
            spend.pubKey({ utxo: { step: "swap", output: 0 } }),
            payTo(carol, 4n * ADA),
          ],
        },
        { payer: ctx.wallet },
      );
      expect(plan.step("swap").kind).toBe("prebuilt");
      const submitter = forwarding(ctx.emulator);
      // A signer that holds none of the keys the step needs: asked once, for the wallet's key
      const stranger = keysSigner("object", testKey());
      const error = await caught(
        plan.run({ submitter, signers: stranger.signer }),
      );
      expect(TxPlanError.is(error, "MISSING_SIGNATURES")).toBe(true);
      expect(error.step).toBe("swap");
      expect(
        error.details.missing.map((k: { keyHash: string }) => k.keyHash),
      ).toEqual([ctx.walletKey]);
      expect(error.message).toMatch(
        /nobody in this call can sign: give signers, a payer that signs, or addWitnesses/,
      );
      expect(stranger.requests.map((r) => r.txHash)).toEqual([
        plan.step("swap").txHash,
      ]);
      expect(stranger.requests[0]!.keys!.map((k) => k.keyHash)).toEqual([
        ctx.walletKey,
      ]);
      expect(statuses(plan)).toMatchObject({ fund: "final", swap: "built" });
      const sent = await Promise.all(submitter.calls.map(hashOf));
      expect(sent).not.toContain(plan.step("swap").txHash);

      const signed = await ctx.builder.fromCbor(partnerCbor);
      await signed.sign({ signers: ctx.wallet });
      await plan.addWitnesses(signed.partialTx);
      expect(plan.step("swap").status).toBe("signed");
      await plan.run({ submitter });
      expect(plan.status).toBe("final");
      expect(paidTo(ctx.emulator, carol)).toEqual([4n * ADA]);
    },
    LONG,
  );

  it(
    "signs a prebuilt step as a step the plan built: the payer by sign() and by run(), signers named by sign({ signers })",
    async () => {
      const ctx = await setup();
      const small = ctx.funded[1]!;
      const cbor = await takesFromWallet(ctx, small);
      const swapHash = await hashOf(cbor);
      const submitter = forwarding(ctx.emulator);

      // The swap of the README: the partner's transaction read, then given with the wallet payer
      const byRun = recording(ctx.wallet);
      const swap = await ctx.builder.fromCbor(cbor);
      expect(swap.missing.map((k) => k.keyHash)).toEqual([ctx.walletKey]);
      const swapPlan = await ctx.builder.plan(
        { swap, pay: payTo(alice, 5n * ADA) },
        { payer: byRun.payer },
      );
      // The payer by sign(), and again after a restart: the record keeps the mark
      const bySign = recording(ctx.wallet);
      const signing = await ctx.builder.plan(
        { swap: cbor, pay: payTo(alice, 6n * ADA) },
        { payer: bySign.payer },
      );
      const json = signing.toJSON();
      await signing.sign();
      expect(bySign.seen).toEqual([swapHash, signing.step("pay").txHash]);
      expect(statuses(signing)).toEqual({ swap: "signed", pay: "signed" });
      expect(signing.step("swap").missing).toEqual([]);
      const byResume = recording(ctx.wallet);
      const resumed = await ctx.builder.resume(json, {
        payer: byResume.payer,
      });
      expect(resumed.step("swap").kind).toBe("prebuilt");
      expect(resumed.step("swap").status).toBe("built");
      await resumed.sign();
      expect(byResume.seen).toEqual([swapHash, resumed.step("pay").txHash]);
      expect(resumed.step("swap").status).toBe("signed");
      // Signers named in the call, for a plan whose payer is an address
      const named = recording(ctx.wallet);
      const keyless = await ctx.builder.plan(
        { pay: payTo(alice, 7n * ADA), swap: cbor },
        { payer: ctx.address },
      );
      await keyless.sign({ signers: named.payer });
      expect(named.seen).toEqual([keyless.step("pay").txHash, swapHash]);
      expect(statuses(keyless)).toEqual({ pay: "signed", swap: "signed" });
      // Signed already: a second call asks nobody
      await keyless.sign({ signers: [named.payer] });
      expect(named.seen).toHaveLength(2);

      // run() alone signs and sends the swap
      await swapPlan.run({ submitter });
      expect(swapPlan.status).toBe("final");
      expect(byRun.seen).toEqual([swapHash, swapPlan.step("pay").txHash]);
      const sent = await Promise.all(submitter.calls.map(hashOf));
      expect(sent).toEqual([swapHash, swapPlan.step("pay").txHash]);
      expect(paidTo(ctx.emulator, alice)).toEqual([5n * ADA]);
      expect(
        ctx.emulator.utxos({ address: ctx.address }).map((u) => ref(u.input)),
      ).not.toContain(ref(small.input));
    },
    LONG,
  );

  it(
    "run({ signers }) signs a prebuilt step that lacks a key of a signer it names",
    async () => {
      const ctx = await setup();
      const cbor = await takesFromWallet(ctx, ctx.funded[1]!);
      const swapHash = await hashOf(cbor);
      const named = recording(ctx.wallet);
      const plan = await ctx.builder.plan(
        { pay: payTo(alice, 7n * ADA), swap: cbor },
        { payer: ctx.address },
      );
      await plan.run({ signers: named.payer });
      expect(plan.status).toBe("final");
      expect(named.seen).toEqual([plan.step("pay").txHash, swapHash]);
      expect(paidTo(ctx.emulator, alice)).toEqual([7n * ADA]);
    },
    LONG,
  );

  it(
    "shows the collateral a prebuilt step puts up, and signs for it as for any step",
    async () => {
      await Crypto.ready();
      const ctx = await setup();
      const maker = testKey();
      ctx.emulator.fund(maker.address, { lovelace: 50n * ADA });
      const script = { code: alwaysSucceedCbor, version: "V3" as const };
      const locked = { txHash: "ab".repeat(32), outputIndex: 0 };
      ctx.emulator.addUtxos([
        {
          input: locked,
          output: {
            address: resolvePlutusScriptAddress(script, 0),
            amount: [{ unit: "lovelace", quantity: "20000000" }],
            plutusData: "d87980",
          },
        },
      ]);
      const small = ctx.funded[1]!;
      const built = await new TxBuilder({
        network: "preprod",
        provider: ctx.emulator,
        evaluator: ctx.emulator,
      }).build(
        [
          spend.plutus({
            utxo: locked,
            script,
            redeemer: { data: mConStr0([]) },
          }),
          collateral({ utxo: small.input }),
          collateralReturn({ address: maker.address }),
        ],
        { payer: maker.address },
      );
      const { payer, seen } = recording(ctx.wallet);
      const plan = await ctx.builder.plan(
        { swap: built.tx, pay: payTo(alice, 5n * ADA) },
        { payer },
      );
      const swap = plan.step("swap");
      expect(codes(swap)).toContain("COLLATERAL_RETURN_ELSEWHERE");
      expect(swap.missing).toContainEqual({
        keyHash: ctx.walletKey,
        roles: expect.arrayContaining(["collateral"]),
      });
      expect(swap.collateral!.inputs.map(ref)).toEqual([ref(small.input)]);
      await plan.sign();
      expect(seen).toEqual([swap.txHash, plan.step("pay").txHash]);
      expect(plan.step("swap").missing).toEqual([]);
      expect(plan.step("swap").status).toBe("signed");
      await plan.run();
      expect(plan.status).toBe("final");
      // Signed already: run() asks nobody
      expect(seen).toHaveLength(2);
    },
    LONG,
  );

  it(
    "takes what a prebuilt step spends out of every step's reach",
    async () => {
      // The wallet holds X, the one UTxO that pays 100 ada, and a small one
      const ctx = await setup({ funds: [300n * ADA, 20n * ADA] });
      const x = ctx.funded[0]!;
      const cbor = await takesFromWallet(ctx, x);
      const payer = { payer: ctx.wallet };
      // Before it and after it, no step selects X
      const orders: PlanSteps[] = [
        { a: payTo(alice, 100n * ADA), swap: cbor },
        { swap: cbor, c: payTo(alice, 100n * ADA) },
      ];
      for (const steps of orders) {
        const error = await caught(ctx.builder.plan(steps, payer));
        expect(TxBuildError.is(error, "INSUFFICIENT_FUNDS")).toBe(true);
      }
      const plan = await ctx.builder.plan(
        { a: payTo(alice, 5n * ADA), swap: cbor, c: payTo(bob, 5n * ADA) },
        payer,
      );
      for (const name of ["a", "c"])
        expect(plan.step(name).inputs.map(ref)).not.toContain(ref(x.input));
      // A part that names X is the build's own refusal
      const named = await caught(
        ctx.builder.plan(
          {
            a: [spend.pubKey({ utxo: x }), payTo(alice, 5n * ADA)],
            swap: cbor,
          },
          payer,
        ),
      );
      expect(TxBuildError.is(named, "UTXO_NOT_FOUND")).toBe(true);
      expect(named.message).toMatch(/^step "a": /);
    },
    LONG,
  );

  it(
    "no out ref is an input of two steps, over random wallets and plans",
    async () => {
      let seed = 7;
      const random = () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
      };
      let made = 0;
      for (let round = 0; round < 6; round++) {
        const funds = Array.from(
          { length: 2 + Math.floor(random() * 4) },
          () => BigInt(20 + Math.floor(random() * 200)) * ADA,
        );
        const ctx = await setup({ funds });
        const taken = ctx.funded[Math.floor(random() * funds.length)]!;
        const cbor = await takesFromWallet(ctx, taken, 10n * ADA);
        const steps: Record<string, PlanSteps[string]> = {};
        const count = 1 + Math.floor(random() * 3);
        const at = Math.floor(random() * (count + 1));
        for (let i = 0; i <= count; i++)
          steps[i === at ? "swap" : `p${i}`] =
            i === at
              ? cbor
              : payTo(alice, BigInt(2 + Math.floor(random() * 40)) * ADA);
        let plan: TxPlan;
        try {
          plan = await ctx.builder.plan(steps, { payer: ctx.wallet });
        } catch (error) {
          // Not enough left beside what the partner's transaction spends
          expect(TxBuildError.is(error, "INSUFFICIENT_FUNDS")).toBe(true);
          continue;
        }
        made += 1;
        const spent = plan.steps.flatMap((step) => step.inputs.map(ref));
        expect(new Set(spent).size).toBe(spent.length);
      }
      expect(made).toBeGreaterThan(2);
    },
    LONG,
  );

  it(
    "shows a prebuilt step from its own bytes",
    async () => {
      const ctx = await setup();
      const fund = await ctx.builder.build(
        [
          output({
            address: ctx.address,
            value: { lovelace: 10n * ADA },
            label: "deposit",
          }),
          payTo(alice, 3n * ADA, "gift"),
        ],
        { payer: ctx.wallet },
      );
      await fund.sign();
      // Another party's JSON of it: an output's value, an input's address and a change mark
      // state what the bytes do not hold
      const json = JSON.parse(JSON.stringify(fund.toJSON()));
      json.built.outputs[0].value.lovelace = String(900n * ADA);
      json.built.inputs[0].address = ctx.partnerAddress;
      json.built.outputs[1].change = true;
      const restored = await ctx.builder.restore(json);
      expect(restored.outputs[0]!.value.lovelace).toBe(900n * ADA);
      const reads = jest.spyOn(ctx.builder, "fromCbor");
      const plan = await ctx.builder.plan(
        {
          fund: restored,
          next: [
            spend.pubKey({ utxo: { step: "fund", output: 0 } }),
            payTo(carol, 9n * ADA),
          ],
        },
        { payer: ctx.wallet },
      );
      // One read of the step, by the public reader
      expect(reads).toHaveBeenCalledTimes(1);
      reads.mockRestore();
      const step = plan.step("fund");
      expect(step.outputs.map((o) => o.value.lovelace)).toEqual(
        fund.outputs.map((o) => o.value.lovelace),
      );
      expect(step.inputs.map((u) => u.address)).toEqual(
        fund.inputs.map((u) => u.address),
      );
      expect(step.inputs[0]!.address).toBe(ctx.address);
      // The change marks of the object, by position, and nothing else of it: a restored
      // object has no labels
      expect(step.outputs[0]!.label).toBeUndefined();
      expect(step.outputs[1]!.change).toBe(true);
      // The step linked to the deposit spends the true one
      const spent = plan
        .step("next")
        .inputs.find((u) => ref(u) === ref(fund.outputs[0]!));
      expect(spent!.value.lovelace).toBe(10n * ADA);
      // A marked output not at the payer's change address is never selected
      expect(plan.step("next").inputs.map((u) => u.address)).not.toContain(
        alice,
      );
      await plan.run();
      expect(plan.status).toBe("final");
      expect(paidTo(ctx.emulator, carol)).toEqual([9n * ADA]);
    },
    LONG,
  );

  /** A store, a funded partner, and two transactions of the partner on its one UTxO */
  const twoOnOne = async () => {
    const ctx = await storeSetup();
    const partner = await walletOf(1);
    const partnerAddress = (await partner.getChangeAddress())!;
    const own = ctx.emulator.fund(partnerAddress, { lovelace: 100n * ADA });
    const partnerBuilder = builderOf(wrap(ctx.emulator));
    const twoOf = async (lovelace: bigint) => {
      const built = await partnerBuilder.build(
        [
          spend.pubKey({ utxo: own }),
          output({ address: alice, value: { lovelace } }),
        ],
        { payer: partner },
      );
      await built.sign();
      return built.partialTx;
    };
    return {
      ...ctx,
      own,
      one: await twoOf(5n * ADA),
      other: await twoOf(6n * ADA),
    };
  };

  it(
    "refuses two steps that spend one output in one call, and records nothing",
    async () => {
      const ctx = await twoOnOne();
      const { own, one, other } = ctx;
      const payer = { payer: ctx.wallet };
      const inOneCall = await caught(
        ctx.builder.plan({ s1: one, s2: other }, { ...payer, id: "a" }),
      );
      expectSteps(inOneCall, /"s2".*"s1"/);
      expect(inOneCall.message).toContain(ref(own.input));
      const twice = await caught(
        ctx.builder.plan({ s1: one, again: one }, { ...payer, id: "b" }),
      );
      expectSteps(twice, /"again".*"s1"/);
      const afterOne = await ctx.builder.fromCbor(one);
      const withAfter = await caught(
        ctx.builder.plan({ s2: other }, { ...payer, id: "c", after: afterOne }),
      );
      expectSteps(withAfter, /of after/);
      expect(withAfter.message).toContain(afterOne.txHash);
      expect(withAfter.message).toContain(ref(own.input));
      expect(ctx.store.saves()).toEqual([]);
    },
    LONG,
  );

  it(
    "refuses through add a step that spends what a recorded step spends, and records nothing",
    async () => {
      const ctx = await twoOnOne();
      const plan = await ctx.builder.plan(
        { s1: ctx.one },
        { payer: ctx.wallet, id: "d" },
      );
      const saves = ctx.store.saves().length;
      const added = await caught(plan.add({ s2: ctx.other }));
      expectSteps(added, /"s2".*"s1"/);
      expect(added.message).toContain(ref(ctx.own.input));
      const again = await caught(plan.add({ x: ctx.one }));
      expectSteps(again, /"x".*"s1"/);
      expect(ctx.store.saves().length).toBe(saves);
      expect(plan.steps.map((step) => step.name)).toEqual(["s1"]);
    },
    LONG,
  );

  it(
    "refuses what fromCbor refuses, with the step's name",
    async () => {
      await Crypto.ready();
      const ctx = await storeSetup();
      const key = testKey();
      const to = `60${key.keyHash}`;
      const inputs = (hash: string) => tag258(arr(arr(bytes(hash), uint(0))));
      const bodyOf = (more: [string, string][] = [], address = to) =>
        map(
          [uint(0), inputs("11".repeat(32))],
          [
            uint(1),
            arr(map([uint(0), bytes(address)], [uint(1), uint(3_000_000)])),
          ],
          [uint(2), uint(170_000)],
          ...more,
        );
      const body = bodyOf();
      const texts: [string, string][] = [
        ["no transaction", "zz"],
        ["a validity flag of false", txOf(body, map(), { valid: "f4" })],
        ["another network", txOf(bodyOf([], `61${key.keyHash}`))],
        [
          "a signature of another body",
          txOf(
            body,
            map([
              uint(0),
              arr(vkeyWitness(key, txHashOf(bodyOf([[uint(3), uint(9)]])))),
            ]),
          ),
        ],
        [
          "a repeated map key",
          txOf(
            map(
              [uint(0), inputs("11".repeat(32))],
              [
                uint(1),
                arr(map([uint(0), bytes(to)], [uint(1), uint(3_000_000)])),
              ],
              [uint(2), uint(170_000)],
              [uint(2), uint(170_001)],
            ),
          ),
        ],
        [
          "more bytes than the limit",
          txOf(body, map(), { aux: bytes("00".repeat(17_000)) }),
        ],
        ["an input found nowhere", txOf(body)],
      ];
      for (const [what, text] of texts) {
        const alone = await caught(ctx.builder.fromCbor(text));
        const reads = jest.spyOn(ctx.builder, "fromCbor");
        const step = await caught(
          ctx.builder.plan(
            { swap: text, pay: payTo(alice, 2n * ADA) },
            { payer: ctx.wallet, id: what },
          ),
        );
        expect(reads).toHaveBeenCalledTimes(1);
        reads.mockRestore();
        expect([what, step.code]).toEqual([what, alone.code]);
        expect(step.details).toEqual(alone.details);
        expect(step.message).toBe(`step "swap": ${alone.message}`);
      }
      expect(ctx.store.saves()).toEqual([]);
    },
    LONG,
  );

  it(
    "quotes nothing of a transaction given",
    async () => {
      const ctx = await setup();
      const fund = await deposit(ctx);
      const secret = "4d".repeat(16) + "a7".repeat(16);
      const cut = fund.partialTx.slice(
        0,
        Math.floor(fund.partialTx.length / 2),
      );
      /** Every text an error holds: its message, stack, details and causes, all the way down */
      const textsOf = (value: unknown, seen = new Set<unknown>()): string[] => {
        if (typeof value === "string") return [value];
        if (typeof value !== "object" || value === null || seen.has(value))
          return [];
        seen.add(value);
        const own = Object.getOwnPropertyNames(value).map(
          (name) => (value as Record<string, unknown>)[name],
        );
        return [String(value), ...own.flatMap((each) => textsOf(each, seen))];
      };
      for (const text of [secret, cut]) {
        for (const call of [
          () =>
            ctx.builder.plan(
              { swap: text, pay: payTo(alice, 2n * ADA) },
              { payer: ctx.wallet },
            ),
          async () =>
            (
              await ctx.builder.plan(
                { pay: payTo(alice, 2n * ADA) },
                { payer: ctx.wallet },
              )
            ).add({ swap: text }),
        ]) {
          const error = await caught(call());
          expect(TxBuildError.is(error, "INVALID_OPTION")).toBe(true);
          expect(error.message).toMatch(/^step "swap": /);
          expect(error.details.value).toBe("string");
          const all = textsOf(error).join("\n");
          for (let at = 0; at + 16 <= text.length; at += 2)
            expect(all.includes(text.slice(at, at + 16))).toBe(false);
        }
      }
    },
    LONG,
  );

  it(
    "holds the type alone of steps of no known form",
    async () => {
      const ctx = await setup();
      const fund = await deposit(ctx);
      const plan = await ctx.builder.plan(
        { pay: payTo(alice, 2n * ADA) },
        { payer: ctx.wallet },
      );
      for (const [call, type] of [
        [() => ctx.builder.plan(fund.partialTx as never), "string"],
        [() => ctx.builder.plan(null as never), "null"],
        [() => ctx.builder.plan({ swap: fund.toJSON() } as never), "object"],
        [
          () => ctx.builder.plan({ swap: fund.partialTx.length } as never),
          "number",
        ],
        [() => plan.add(fund.partialTx as never), "string"],
        [() => plan.add({ swap: { ...fund } } as never), "object"],
      ] as const) {
        const error = await caught(call());
        expectSteps(error);
        expect(error.details.value).toBe(type);
      }
    },
    LONG,
  );

  it(
    "refuses a record whose prebuilt step lost its kind or is called a consolidation, and asks no signer",
    async () => {
      const ctx = await setup();
      const cbor = await takesFromWallet(ctx, ctx.funded[1]!);
      const { payer, seen } = recording(ctx.wallet);
      const plan = await ctx.builder.plan(
        { swap: cbor, pay: payTo(alice, 5n * ADA) },
        { payer },
      );
      const edits: [(step: Record<string, unknown>) => void, RegExp][] = [
        [(step) => delete step.kind, /has neither kind nor given/],
        [
          (step) => (step.kind = "consolidation"),
          /a consolidation step that pays an address that is not the change address of a payer of the plan/,
        ],
      ];
      for (const [edit, message] of edits) {
        const json = JSON.parse(JSON.stringify(plan.toJSON()));
        edit(json.steps.find((step: { name: string }) => step.name === "swap"));
        const error = await caught(ctx.builder.resume(json, { payer }));
        expect(TxPlanError.is(error, "INVALID_STATE")).toBe(true);
        expect(error.details).toEqual({ reason: "recordVersion" });
        expect(error.message).toMatch(message);
      }
      expect(seen).toEqual([]);
    },
    LONG,
  );

  it(
    "tells an object given as a step by the hash of its bytes",
    async () => {
      const ctx = await setup();
      const a = await partnerPays(ctx, alice, 5n * ADA);
      const b = await partnerPays(ctx, bob, 6n * ADA);
      /** An object with the bytes of b that states the hash of a */
      const forged = () => {
        const object = Object.create(Object.getPrototypeOf(b));
        Object.defineProperty(object, "txHash", { value: a.txHash });
        Object.defineProperty(object, "partialTx", { value: b.partialTx });
        Object.defineProperty(object, "outputs", { value: b.outputs });
        return object as BuiltTx;
      };
      const plan = await ctx.builder.plan(
        { pay: payTo(carol, 2n * ADA) },
        { payer: ctx.wallet },
      );
      await plan.add({ swap: a });
      const record = plan.toJSON();
      // Another transaction under the name, never the same step
      expectSteps(await caught(plan.add({ swap: forged() })));
      expect(plan.step("swap").txHash).toBe(a.txHash);
      expect(plan.toJSON()).toEqual(record);
      // Under another name it is read from its bytes: b, which spends what a spends
      expectSteps(
        await caught(plan.add({ other: forged() })),
        /step "other" spends .*, which step "swap" spends/,
      );
    },
    LONG,
  );

  it(
    "a repeated id tells an object by the hash of its bytes",
    async () => {
      const ctx = await storeSetup();
      const partner = await walletOf(1);
      const partnerAddress = (await partner.getChangeAddress())!;
      ctx.emulator.fund(partnerAddress, { lovelace: 100n * ADA });
      const partnerBuilder = builderOf(wrap(ctx.emulator));
      const payOf = async (to: string, lovelace: bigint) => {
        const built = await partnerBuilder.build(
          output({ address: to, value: { lovelace } }),
          { payer: partner },
        );
        await built.sign();
        return built;
      };
      const a = await payOf(alice, 5n * ADA);
      const b = await payOf(bob, 6n * ADA);
      const forged = Object.create(Object.getPrototypeOf(b));
      Object.defineProperty(forged, "txHash", { value: a.txHash });
      Object.defineProperty(forged, "partialTx", { value: b.partialTx });
      Object.defineProperty(forged, "outputs", { value: b.outputs });
      const options = { payer: ctx.wallet, id: "forged" };
      const steps = (swap: BuiltTx) => ({ swap, pay: payTo(carol, 2n * ADA) });
      await ctx.builder.plan(steps(a), options);
      const error = await caught(ctx.builder.plan(steps(forged), options));
      expect(TxPlanError.is(error, "PLAN_EXISTS")).toBe(true);
    },
    LONG,
  );

  it(
    "knows the outputs of earlier steps without a lookup",
    async () => {
      const ctx = await setup();
      const asked: string[] = [];
      ctx.provider.control.hooks.fetchUTxOs = (forward, ...args) => {
        asked.push(String(args[0]));
        return forward(...args);
      };
      const fund = await deposit(ctx);
      const swap = await partnerSwap(ctx, fund);
      const plan = await ctx.builder.plan(
        { fund, swap },
        {
          payer: ctx.wallet,
          knownUtxos: [
            { ...fund.outputs[0]!, value: { lovelace: 900n * ADA } },
          ],
        },
      );
      expect(asked).not.toContain(fund.txHash);
      const spent = plan
        .step("swap")
        .inputs.find((u) => ref(u) === ref(fund.outputs[0]!));
      expect(spent!.value.lovelace).toBe(10n * ADA);
    },
    LONG,
  );

  /**
   * The application's deposit of 10 ada to the wallet, and its JSON as another party sends it
   * back: output 0 stated at `address`, restored
   */
  const statedElsewhere = async (ctx: Ctx, address: string) => {
    const fund = await ctx.builder.build(
      [output({ address: ctx.address, value: { lovelace: 10n * ADA } })],
      { payer: ctx.wallet },
    );
    await fund.sign();
    const json = JSON.parse(JSON.stringify(fund.toJSON()));
    json.built.outputs[0].address = address;
    const stated = await ctx.builder.restore(json);
    expect(stated.outputs[0]!.address).toBe(address);
    return { fund, stated };
  };

  it(
    "reads what a prebuilt step spends of a transaction of after from that transaction's bytes",
    async () => {
      const ctx = await setup();
      const { fund, stated } = await statedElsewhere(ctx, ctx.partnerAddress);
      // The partner's transaction spends fund#0, the wallet's by the bytes, and pays the partner
      const p = await ctx.partnerBuilder.build(
        [
          spend.pubKey({ utxo: stated.outputs[0]! }),
          output({
            address: ctx.partnerAddress,
            value: { lovelace: 15n * ADA },
          }),
        ],
        { payer: ctx.partner },
      );
      await p.sign();
      const alone = await ctx.builder.fromCbor(p.partialTx, {
        knownUtxos: fund.outputs,
      });
      expect(alone.missing.map((k) => k.keyHash)).toContain(ctx.walletKey);
      // The object as given, and its members as plain data: the same reading
      for (const after of [stated, { ...stated }]) {
        const { payer, seen } = recording(ctx.wallet);
        const plan = await ctx.builder.plan(
          { swap: p.partialTx, pay: payTo(alice, 5n * ADA) },
          { payer, after },
        );
        const swap = plan.step("swap");
        expect(swap.missing).toEqual(alone.missing);
        expect(swap.signers).toEqual(alone.signers);
        expect(swap.inputs).toEqual(alone.inputs);
        expect(swap.inputs.map((u) => u.address)).toContain(ctx.address);
        expect(swap.status).toBe("built");
        await plan.sign();
        expect(seen).toEqual([swap.txHash, plan.step("pay").txHash]);
        expect(plan.step("swap").status).toBe("signed");
      }
    },
    LONG,
  );

  it(
    "reads a wallet's collateral a prebuilt step puts up from the bytes of a transaction of after",
    async () => {
      await Crypto.ready();
      const ctx = await setup();
      const maker = testKey();
      ctx.emulator.fund(maker.address, { lovelace: 50n * ADA });
      const { fund, stated } = await statedElsewhere(ctx, maker.address);
      // On chain, so that the maker's build reads it; a transaction of after comes first
      await fund.submit();
      advance(ctx.emulator, 50);
      const script = { code: alwaysSucceedCbor, version: "V3" as const };
      const locked = { txHash: "ab".repeat(32), outputIndex: 0 };
      ctx.emulator.addUtxos([
        {
          input: locked,
          output: {
            address: resolvePlutusScriptAddress(script, 0),
            amount: [{ unit: "lovelace", quantity: "20000000" }],
            plutusData: "d87980",
          },
        },
      ]);
      const built = await new TxBuilder({
        network: "preprod",
        provider: ctx.emulator,
        evaluator: ctx.emulator,
      }).build(
        [
          spend.plutus({
            utxo: locked,
            script,
            redeemer: { data: mConStr0([]) },
          }),
          collateral({ utxo: fund.outputs[0]! }),
          collateralReturn({ address: maker.address }),
        ],
        { payer: maker.address },
      );
      const plan = await ctx.builder.plan(
        { swap: built.tx },
        { payer: ctx.wallet, after: stated },
      );
      const swap = plan.step("swap");
      expect(swap.collateral!.inputs.map((u) => u.address)).toEqual([
        ctx.address,
      ]);
      expect(swap.missing).toContainEqual({
        keyHash: ctx.walletKey,
        roles: expect.arrayContaining(["collateral"]),
      });
      expect(codes(swap)).toContain("COLLATERAL_RETURN_ELSEWHERE");
    },
    LONG,
  );

  it(
    "refuses a transaction of after whose bytes are not read, and takes none of its outputs",
    async () => {
      const ctx = await setup();
      const { fund, stated } = await statedElsewhere(ctx, ctx.partnerAddress);
      const cbor = await takesFromWallet(ctx, stated.outputs[0]!);
      const unread = { ...stated, tx: "00" };
      for (const knownUtxos of [undefined, fund.outputs]) {
        const error = await caught(
          ctx.builder.plan(
            { swap: cbor },
            {
              payer: ctx.wallet,
              after: unread,
              ...(knownUtxos !== undefined && { knownUtxos }),
            },
          ),
        );
        expect(TxBuildError.is(error, "INVALID_OPTION")).toBe(true);
        expect(error.details).toMatchObject({ option: "after" });
      }
      // Without it, the application's knownUtxos give the output
      const plan = await ctx.builder.plan(
        { swap: cbor },
        { payer: ctx.wallet, knownUtxos: fund.outputs },
      );
      expect(plan.step("swap").inputs[0]!.address).toBe(ctx.address);
      expect(plan.step("swap").missing.map((k) => k.keyHash)).toContain(
        ctx.walletKey,
      );
    },
    LONG,
  );

  it(
    "sends a signed transaction as it came",
    async () => {
      const ctx = await setup();
      const { given, swap } = await untaggedSigned(ctx);
      const { payer, seen } = recording(ctx.wallet);
      const plan = await ctx.builder.plan({ swap: given }, { payer });
      const step = plan.step("swap");
      expect(step.status).toBe("signed");
      expect(step.signedTx!.length).toBeLessThanOrEqual(given.length);
      expect(step.signedTx).toBe(given);
      const again = await ctx.builder.resume(plan.toJSON(), { payer });
      expect(again.step("swap").signedTx).toBe(given);
      const submitter = forwarding(ctx.emulator);
      await again.run({ submitter });
      expect(again.status).toBe("final");
      expect(seen).toEqual([]);
      expect(submitter.calls).toEqual([given]);
      expect(paidTo(ctx.emulator, alice)).toEqual([7n * ADA]);
      expect(swap.txHash).toBe(step.txHash);
    },
    LONG,
  );

  it(
    "selects only marked change",
    async () => {
      const ctx = await setup({ funds: [10n * ADA], partnerFunds: 300n * ADA });
      const cbor = (await partnerPays(ctx, ctx.address, 100n * ADA)).partialTx;
      const payer = { payer: ctx.wallet };
      const short = await caught(
        ctx.builder.plan({ swap: cbor, next: payTo(alice, 50n * ADA) }, payer),
      );
      expect(TxBuildError.is(short, "INSUFFICIENT_FUNDS")).toBe(true);
      expect(short.message).toMatch(/^step "next": /);
      const linked = await ctx.builder.plan(
        {
          swap: cbor,
          next: [
            spend.pubKey({ utxo: { step: "swap", output: 0 } }),
            payTo(alice, 50n * ADA),
          ],
        },
        payer,
      );
      expect(linked.step("next").standsOn).toEqual(["swap"]);
      // An object of build leaves change: the next step of its payer spends it
      const fund = await ctx.builder.build(payTo(alice, 5n * ADA), payer);
      await fund.sign();
      const plan = await ctx.builder.plan(
        { fund, next: payTo(bob, 2n * ADA) },
        payer,
      );
      expect(plan.step("next").standsOn).toEqual(["fund"]);
      expect(plan.step("next").inputs.map(ref)).toContain(ref(fund.change[0]!));
      await plan.run();
      expect(plan.status).toBe("final");
    },
    LONG,
  );

  it(
    "links to a prebuilt step",
    async () => {
      const ctx = await setup();
      const fund = await deposit(ctx);
      const payer = { payer: ctx.wallet };
      const byLabel = await ctx.builder.plan(
        {
          fund,
          next: [
            spend.pubKey({ utxo: { step: "fund", output: "deposit" } }),
            payTo(alice, 3n * ADA),
          ],
        },
        payer,
      );
      expect(byLabel.step("next").inputs.map(ref)).toContain(
        ref(fund.outputs[0]!),
      );
      const unknown = await caught(
        ctx.builder.plan(
          {
            fund: fund.partialTx,
            next: [
              spend.pubKey({ utxo: { step: "fund", output: "deposit" } }),
              payTo(alice, 3n * ADA),
            ],
          },
          payer,
        ),
      );
      expect(TxBuildError.is(unknown, "UNKNOWN_LABEL")).toBe(true);
      const change = await caught(
        ctx.builder.plan(
          {
            fund: fund.partialTx,
            next: [
              spend.pubKey({ utxo: { step: "fund", change: true } }),
              payTo(alice, 3n * ADA),
            ],
          },
          payer,
        ),
      );
      expectSteps(
        change,
        /no output marked change: name the output by its position/,
      );
      // By position it is named as any output
      const byPosition = await ctx.builder.plan(
        {
          fund: fund.partialTx,
          next: [
            spend.pubKey({ utxo: { step: "fund", output: 1 } }),
            payTo(alice, 3n * ADA),
          ],
        },
        payer,
      );
      expect(byPosition.step("next").inputs.map(ref)).toContain(
        ref(fund.outputs[1]!),
      );
    },
    LONG,
  );

  it(
    "takes labels only from an object built here",
    async () => {
      const ctx = await setup();
      const fund = await ctx.builder.build(
        [
          output({
            address: ctx.address,
            value: { lovelace: 50n * ADA },
            label: "vault",
          }),
          output({ address: ctx.address, value: { lovelace: 2n * ADA } }),
        ],
        { payer: ctx.wallet },
      );
      await fund.sign();
      // Another party's JSON of it: the label moved to the 2-ada output
      const json = JSON.parse(JSON.stringify(fund.toJSON()));
      delete json.built.outputs[0].label;
      json.built.outputs[1].label = "vault";
      const moved = await ctx.builder.restore(json);
      const take = (fundStep: BuiltTx, output: string | number) =>
        ctx.builder.plan(
          {
            fund: fundStep,
            take: [
              spend.pubKey({ utxo: { step: "fund", output } }),
              payTo(carol, 50n * ADA),
            ],
          },
          { payer: ctx.wallet },
        );
      // A restored object and one of fromCbor are read by position
      for (const object of [
        moved,
        await ctx.builder.restore(fund.toJSON()),
        await ctx.builder.fromCbor(fund.partialTx),
      ]) {
        const error = await caught(take(object, "vault"));
        expect(TxBuildError.is(error, "UNKNOWN_LABEL")).toBe(true);
        expect((error as Error).message).toMatch(
          /name the output by its position/,
        );
      }
      // The output named, never the 2-ada one; the change of fund may be selected
      const byPosition = await take(moved, 0);
      expect(
        byPosition
          .step("take")
          .inputs.filter((u) => u.txHash === fund.txHash)
          .map((u) => u.outputIndex)
          .filter((i) => i < 2),
      ).toEqual([0]);
      // An object of build keeps its labels
      const own = await take(fund, "vault");
      expect(own.step("fund").outputs[0]!.label).toBe("vault");
      expect(
        own
          .step("take")
          .inputs.filter((u) => u.txHash === fund.txHash)
          .map((u) => u.outputIndex)
          .filter((i) => i < 2),
      ).toEqual([0]);
    },
    LONG,
  );

  it(
    "a prebuilt step with no end of validity never expires",
    async () => {
      const ctx = await setup();
      const slotNow = ctx.emulator.slot;
      const open = (await partnerPays(ctx, alice, 5n * ADA)).tx;
      const ends = (
        await partnerPays(ctx, alice, 6n * ADA, [
          validity({ until: ctx.builder.timeAt(slotNow + 300) }),
        ])
      ).tx;
      const results: Record<string, unknown> = {};
      for (const [name, cbor] of [
        ["open", open],
        ["ends", ends],
      ] as const) {
        const plan = await ctx.builder.plan(
          { swap: cbor, pay: payTo(bob, 2n * ADA) },
          { payer: ctx.wallet },
        );
        results[name] = codes(plan.step("swap")).includes("NEVER_EXPIRES");
        await plan.stop();
        advance(ctx.emulator, 5_000);
        await plan.refresh();
        results[`${name} statuses`] = statuses(plan);
        results[`${name} plan`] = plan.status;
        results[`${name} until`] = plan.until;
      }
      expect(results).toMatchObject({
        open: true,
        "open statuses": { swap: "built", pay: "expired" },
        "open plan": "stopping",
        "open until": undefined,
        ends: false,
        "ends statuses": { swap: "expired", pay: "expired" },
        "ends plan": "stopped",
      });
    },
    LONG,
  );

  it(
    "goes on when its maker sent a prebuilt step",
    async () => {
      const ctx = await setup();
      const signed = await partnerPays(ctx, alice, 7n * ADA);
      const plan = await ctx.builder.plan(
        { swap: signed.signedTx!, pay: payTo(bob, 2n * ADA) },
        { payer: ctx.wallet },
      );
      await ctx.emulator.submitTx(signed.signedTx!);
      const submitter = forwarding(ctx.emulator);
      await plan.run({ submitter });
      expect(plan.status).toBe("final");
      expect(paidTo(ctx.emulator, alice)).toEqual([7n * ADA]);
      expect(paidTo(ctx.emulator, bob)).toEqual([2n * ADA]);
      expect(await Promise.all(submitter.calls.map(hashOf))).toEqual([
        plan.step("pay").txHash,
      ]);
    },
    LONG,
  );

  it(
    "a restart in the middle",
    async () => {
      const ctx = await storeSetup();
      const partner = await walletOf(1);
      const partnerAddress = (await partner.getChangeAddress())!;
      ctx.emulator.fund(partnerAddress, { lovelace: 100n * ADA });
      const partnerBuilder = builderOf(wrap(ctx.emulator));
      const fund = await ctx.builder.build(
        output({ address: ctx.address, value: { lovelace: 10n * ADA } }),
        { payer: ctx.wallet },
      );
      await fund.sign();
      const partnerTx = await partnerBuilder.build(
        [
          spend.pubKey({ utxo: fund.outputs[0]! }),
          output({ address: ctx.address, value: { lovelace: 12n * ADA } }),
        ],
        { payer: partner },
      );
      await partnerTx.sign();
      const swap = await ctx.builder.fromCbor(partnerTx.partialTx, {
        knownUtxos: fund.outputs,
      });
      await swap.sign({ signers: ctx.wallet });
      const submitter = forwarding(ctx.emulator);
      const plan = await ctx.builder.plan(
        {
          fund,
          swap,
          payout: [
            spend.pubKey({ utxo: { step: "swap", output: 0 } }),
            payTo(carol, 4n * ADA),
          ],
        },
        { payer: ctx.address, id: "restart" },
      );
      await plan.run({ waitFor: "sent", submitter });
      expect(plan.step("fund").status).toBe("sent");
      const other = ctx.instance();
      const { payer, seen } = recording(ctx.wallet);
      const resumed = await other.builder.resume("restart", { payer });
      expect(resumed.steps.map((step) => step.kind)).toEqual([
        "prebuilt",
        "prebuilt",
        undefined,
      ]);
      await resumed.run({ submitter });
      expect(resumed.status).toBe("final");
      expect(seen).toEqual([resumed.step("payout").txHash]);
      const byHash = new Map<string, Set<string>>();
      for (const sent of submitter.calls) {
        const hash = await hashOf(sent);
        byHash.set(hash, (byHash.get(hash) ?? new Set()).add(sent));
      }
      expect(byHash.size).toBe(3);
      for (const bytesSent of byHash.values()) expect(bytesSent.size).toBe(1);
      expect(paidTo(ctx.emulator, carol)).toEqual([4n * ADA]);
    },
    LONG,
  );

  it(
    "the record reads back",
    async () => {
      const ctx = await setup();
      const { given } = await untaggedSigned(ctx);
      const fund = await deposit(ctx);
      const plan = await ctx.builder.plan(
        { swap: given, fund, pay: payTo(bob, 2n * ADA) },
        { payer: ctx.wallet },
      );
      const json = JSON.parse(JSON.stringify(plan.toJSON()));
      const [swap, fundJson] = json.steps;
      expect(swap.kind).toBe("prebuilt");
      expect(swap).not.toHaveProperty("given");
      expect(fundJson.kind).toBe("prebuilt");
      // The witnesses in the form they came in: a vkey entry without the set tag
      const entry = mapPairs(swap.tx.witnesses).find(
        ([k]) => k === uint(0),
      )![1];
      expect(entry.startsWith("d90102")).toBe(false);
      expect(entry).toBe(witnessEntry(given, 0));
      expect(readPlan(json)).toEqual(recordOf(plan));
      const fromText = readPlan(JSON.parse(JSON.stringify(json)));
      expect(fromText).toEqual(recordOf(plan));

      const notRead = (record: unknown) => {
        const error = (() => {
          try {
            readPlan(record);
          } catch (caughtError) {
            return caughtError as TxPlanError;
          }
          throw new Error("the record was read");
        })();
        expect(TxPlanError.is(error, "INVALID_STATE")).toBe(true);
        expect(error.details).toEqual({ reason: "recordVersion" });
        return error;
      };
      const withGiven = JSON.parse(JSON.stringify(json));
      withGiven.steps[0].given = { parts: [] };
      expect(notRead(withGiven).message).toMatch(/given is on a prebuilt step/);
      // Two plans on the wallet's one UTxO: a step of each spends it
      const lone = await setup({ funds: [50n * ADA] });
      const a = await lone.builder.plan(
        { a: payTo(alice, 2n * ADA) },
        { payer: lone.wallet },
      );
      const b = await lone.builder.plan(
        { b: payTo(bob, 3n * ADA) },
        { payer: lone.wallet },
      );
      const spliced = JSON.parse(JSON.stringify(a.toJSON()));
      spliced.steps.push(JSON.parse(JSON.stringify(b.toJSON())).steps[0]);
      expect(notRead(spliced).message).toMatch(
        /spends .*#0, which the step "a"/,
      );
    },
    LONG,
  );

  it(
    "rest gives a prebuilt step back as its transaction",
    async () => {
      const ctx = await setup();
      const fund = await deposit(ctx);
      const partnerCbor = await partnerSwap(ctx, fund);
      // A payer that is an address: nobody signs the swap
      const plan = await ctx.builder.plan(
        { fund, swap: partnerCbor },
        { payer: ctx.address },
      );
      const error = await caught(plan.run());
      expect(TxPlanError.is(error, "MISSING_SIGNATURES")).toBe(true);
      expect(statuses(plan)).toEqual({ fund: "final", swap: "built" });
      const { rest } = plan;
      expect(Object.keys(rest)).toEqual(["swap"]);
      const back = rest.swap as BuiltTx;
      expect(back.constructor.name).toBe("BuiltTx");
      expect(back.txHash).toBe(plan.step("swap").txHash);
      expect(back.missing).toEqual(plan.step("swap").missing);
      expect(await signedKeyHashes(back.partialTx)).toEqual(
        await signedKeyHashes(partnerCbor),
      );
      // Given again, it is the same transaction
      const again = await ctx.builder.plan(rest, { payer: ctx.wallet });
      expect(again.step("swap").txHash).toBe(back.txHash);
      expect(again.step("swap").kind).toBe("prebuilt");
    },
    LONG,
  );

  it(
    "add with a prebuilt step",
    async () => {
      const ctx = await setup();
      const plan = await ctx.builder.plan(
        {
          deposit: output({
            address: ctx.address,
            value: { lovelace: 10n * ADA },
            label: "deposit",
          }),
        },
        { payer: ctx.wallet },
      );
      const depositStep = plan.step("deposit");
      const partnerTx = await ctx.partnerBuilder.build(
        [
          spend.pubKey({ utxo: depositStep.outputs[0]! }),
          output({ address: ctx.address, value: { lovelace: 12n * ADA } }),
        ],
        { payer: ctx.partner },
      );
      await partnerTx.sign();
      const swap = await ctx.builder.fromCbor(partnerTx.partialTx, {
        knownUtxos: depositStep.outputs,
      });
      await swap.sign({ signers: ctx.wallet });
      const asked: string[] = [];
      ctx.provider.control.hooks.fetchUTxOs = (forward, ...args) => {
        asked.push(String(args[0]));
        return forward(...args);
      };
      const steps = {
        swap,
        payout: [
          spend.pubKey({ utxo: { step: "swap", output: 0 } }),
          payTo(carol, 4n * ADA),
        ],
      };
      await plan.add(steps);
      expect(plan.step("swap").kind).toBe("prebuilt");
      expect(plan.step("swap").standsOn).toEqual(["deposit"]);
      expect(plan.step("payout").standsOn).toContain("swap");
      expect(asked).not.toContain(depositStep.txHash);
      // The same call again reads nothing
      const calls = allCalls(ctx.provider.control.calls);
      expect(await plan.add(steps)).toBe(plan);
      expect(allCalls(ctx.provider.control.calls)).toBe(calls);
      const otherTx = await ctx.partnerBuilder.build(
        [
          spend.pubKey({ utxo: depositStep.outputs[0]! }),
          output({ address: ctx.address, value: { lovelace: 13n * ADA } }),
        ],
        { payer: ctx.partner },
      );
      expectSteps(
        await caught(plan.add({ ...steps, swap: otherTx.tx })),
        /another transaction/,
      );
      await plan.run();
      expect(plan.status).toBe("final");
      expect(paidTo(ctx.emulator, carol)).toEqual([4n * ADA]);
      const onFinal = await caught(
        plan.add({ late: (await partnerPays(ctx, bob, 2n * ADA)).tx }),
      );
      expect(TxPlanError.is(onFinal, "INVALID_STATE")).toBe(true);
      expect(onFinal.details).toEqual({ reason: "final" });
      const stopped = await ctx.builder.plan(
        { a: payTo(alice, 2n * ADA) },
        { payer: ctx.wallet },
      );
      await stopped.stop();
      const onStopped = await caught(
        stopped.add({ late: (await partnerPays(ctx, bob, 3n * ADA)).tx }),
      );
      expect(TxPlanError.is(onStopped, "INVALID_STATE")).toBe(true);
      expect(onStopped.details).toEqual({ reason: "stopped" });
    },
    LONG,
  );

  it(
    "a repeated id",
    async () => {
      const ctx = await storeSetup();
      const partner = await walletOf(1);
      const partnerAddress = (await partner.getChangeAddress())!;
      ctx.emulator.fund(partnerAddress, { lovelace: 100n * ADA });
      const partnerBuilder = builderOf(wrap(ctx.emulator));
      const fund = await ctx.builder.build(
        output({ address: ctx.address, value: { lovelace: 10n * ADA } }),
        { payer: ctx.wallet },
      );
      await fund.sign();
      const swapOf = async (lovelace: bigint) => {
        const built = await partnerBuilder.build(
          [
            spend.pubKey({ utxo: fund.outputs[0]! }),
            output({ address: ctx.address, value: { lovelace } }),
          ],
          { payer: partner },
        );
        await built.sign();
        return built.partialTx;
      };
      const partnerCbor = await swapOf(12n * ADA);
      const stepsOf = (swap: BuiltTx | string) => ({
        fund,
        swap,
        payout: [
          spend.pubKey({ utxo: { step: "swap", output: 0 } }),
          payTo(carol, 4n * ADA),
        ],
      });
      const options = { payer: ctx.wallet, id: "repeat" };
      const plan = await ctx.builder.plan(stepsOf(partnerCbor), options);
      const saves = ctx.store.saves().length;
      const calls = allCalls(ctx.provider.control.calls);
      const again = await ctx.builder.plan(stepsOf(partnerCbor), options);
      expect(again.toJSON()).toEqual(plan.toJSON());
      expect(ctx.store.saves().length).toBe(saves);
      expect(allCalls(ctx.provider.control.calls)).toBe(calls);
      // One witness more: the recorded plan, the witness not added
      const more = await ctx.builder.fromCbor(partnerCbor, {
        knownUtxos: fund.outputs,
      });
      await more.sign({ signers: ctx.wallet });
      const withMore = await ctx.builder.plan(stepsOf(more), options);
      expect(withMore.step("swap").status).toBe("built");
      expect(withMore.toJSON()).toEqual(plan.toJSON());
      expect(ctx.store.saves().length).toBe(saves);
      // Another transaction under the name
      const other = await caught(
        ctx.builder.plan(stepsOf(await swapOf(13n * ADA)), options),
      );
      expect(TxPlanError.is(other, "PLAN_EXISTS")).toBe(true);
    },
    LONG,
  );

  it(
    "consolidation leaves the inputs of a prebuilt step alone",
    async () => {
      const emulator = await emulatorOf(100_000_000);
      const provider = wrap(emulator);
      const params = await emulator.fetchProtocolParameters();
      const builder = builderOf(provider, {
        params: { ...params, maxTxSize: 4096 },
      });
      const wallet = await walletOf();
      const address = (await wallet.getChangeAddress())!;
      const coins = Array.from({ length: 300 }, () =>
        emulator.fund(address, { lovelace: 2n * ADA }),
      );
      const partner = await walletOf(1);
      const partnerAddress = (await partner.getChangeAddress())!;
      emulator.fund(partnerAddress, { lovelace: 100n * ADA });
      const partnerTx = await builderOf(wrap(emulator)).build(
        [
          ...coins.slice(100, 125).map((utxo) => spend.pubKey({ utxo })),
          output({ address: partnerAddress, value: { lovelace: 40n * ADA } }),
        ],
        { payer: partner },
      );
      const taken = new Set(partnerTx.inputs.map(ref));
      for (const steps of [
        { main: payTo(alice, 500n * ADA), swap: partnerTx.tx },
        { swap: partnerTx.tx, main: payTo(alice, 500n * ADA) },
      ]) {
        const plan = await builder.plan(steps, { payer: wallet });
        const built = plan.steps.filter((step) => step.kind !== "prebuilt");
        expect(built.some((step) => step.kind === "consolidation")).toBe(true);
        for (const step of built)
          for (const input of step.inputs)
            expect(taken.has(ref(input))).toBe(false);
      }
    },
    LONG,
  );
});

/**
 * A transaction of the partner's own UTxOs paying alice 7 ada, fully signed, its vkey witnesses
 * written without the set tag over a body that writes its sets with it
 */
const untaggedSigned = async (ctx: Ctx) => {
  const swap = await partnerPays(ctx, alice, 7n * ADA);
  const signed = swap.signedTx!;
  const [body, , valid, aux] = topItems(signed);
  const entry = witnessEntry(signed, 0)!;
  expect(entry.startsWith("d90102")).toBe(true);
  const given = arr(
    body!,
    map([uint(0), entry.slice("d90102".length)]),
    valid!,
    aux!,
  );
  expect(given.length).toBeLessThan(signed.length);
  return { given, swap };
};
