import type { MeshWallet } from "@meshsdk/wallet";
import { Crypto } from "@meshsdk/core-cst";

import type { BuiltTx } from "../../../src/tx-builder";
import type { Validator } from "./plan-emulator-util";
import {
  output,
  spend,
  TxBuildError,
  TxPlanError,
} from "../../../src/tx-builder";
import { recordOf } from "../../../src/tx-builder/plan/plan";
import { arr, map, mapPairs, topItems, uint, witnessEntry } from "../cbor-util";
import { hashSigner, testKey } from "../hash-signer-util";
import {
  builderOf,
  caught,
  hashOf,
  VALIDATORS,
  walletOf,
  wrap,
} from "./plan-emulator-util";
import { ADA, alice, bob, carol, payTo, stepSetup } from "./run-util";
import { gate, storeSetup } from "./store-util";

// Rules of steps given built, and of the steps beside them, that hold apart from the rest: the
// order through other steps, who is asked to sign, what is known first, the count of an object's
// outputs, recorded steps in add, the call's signal, the plan payer's change address, the witness
// set `rest` gives back, `sign()` with no signer, and a witness that does not verify.

const LONG = 120_000;

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

/** An emulator, the plan's builder and wallet, and a funded partner with a builder of its own */
const setup = async (v: Validator) => {
  const ctx = await stepSetup(v, { funds: [1000n * ADA, 20n * ADA] });
  const partner = await walletOf(1);
  const partnerAddress = (await partner.getChangeAddress())!;
  const partnerFunds = ctx.emulator.fund(partnerAddress, {
    lovelace: 100n * ADA,
  });
  const partnerBuilder = builderOf(wrap(ctx.emulator), {
    evaluator: ctx.emulator,
  });
  return { ...ctx, partner, partnerAddress, partnerBuilder, partnerFunds };
};

type Ctx = Awaited<ReturnType<typeof setup>>;

/** The partner's transaction, signed by the partner, that spends a UTxO of the wallet */
const takesFromWallet = async (ctx: Ctx) => {
  const swap = await ctx.partnerBuilder.build(
    [
      spend.pubKey({ utxo: ctx.funded[1]! }),
      output({ address: ctx.partnerAddress, value: { lovelace: 15n * ADA } }),
    ],
    { payer: ctx.partner },
  );
  await swap.sign();
  return swap.partialTx;
};

/** A transaction of the partner's own UTxOs, signed by the partner, paying an address */
const partnerPays = async (ctx: Ctx, address: string, lovelace: bigint) => {
  const built = await ctx.partnerBuilder.build(
    output({ address, value: { lovelace } }),
    { payer: ctx.partner },
  );
  await built.sign();
  return built;
};

describe.each(VALIDATORS)("rules of steps given built (%s)", (v) => {
  it(
    "a step stands on the step before it of its payer through a step of another payer",
    async () => {
      const ctx = await setup(v);
      const plan = await ctx.builder.plan(
        {
          a: payTo(alice, 5n * ADA),
          // Another payer spends the change of a and pays the wallet
          b: {
            parts: [
              spend.pubKey({ utxo: { step: "a", change: true } }),
              output({ address: ctx.address, value: { lovelace: 3n * ADA } }),
            ],
            payer: ctx.partner,
          },
          c: [
            spend.pubKey({ utxo: { step: "b", output: 0 } }),
            payTo(carol, 1n * ADA),
          ],
        },
        { payer: ctx.wallet },
      );
      expect(plan.step("b").standsOn).toEqual(["a"]);
      expect(plan.step("c").standsOn).toEqual(["b"]);
    },
    LONG,
  );

  it(
    "asks the call's signers once for a step given built that another party sent without every witness",
    async () => {
      const ctx = await setup(v);
      const cbor = await takesFromWallet(ctx);
      const swapHash = await hashOf(cbor);
      const plan = await ctx.builder.plan(
        { swap: cbor, pay: payTo(alice, 2n * ADA) },
        { payer: ctx.wallet },
      );
      // Found in a block once and rolled back: sent, and the plan does not hold every witness
      const json = JSON.parse(JSON.stringify(plan.toJSON()));
      const swap = json.steps.find(
        (step: { name: string }) => step.name === "swap",
      );
      swap.status = "sent";
      swap.seen = { slot: ctx.emulator.slot };
      swap.tx.delivered = true;
      json.status = "pending";
      const { payer, seen } = recording(ctx.wallet);
      const resumed = await ctx.builder.resume(json, { payer });
      expect(resumed.step("swap").status).toBe("sent");
      expect(resumed.step("swap").signedTx).toBeUndefined();
      await resumed.run({ signers: payer, waitFor: "sent" });
      expect(seen).toEqual([swapHash]);
      expect(resumed.step("swap").missing).toEqual([]);
    },
    LONG,
  );

  it(
    "knows an output of a transaction of after before the call's knownUtxos",
    async () => {
      const ctx = await setup(v);
      const fund = await ctx.builder.build(
        output({ address: ctx.address, value: { lovelace: 10n * ADA } }),
        { payer: ctx.wallet },
      );
      await fund.sign();
      const swap = await ctx.partnerBuilder.build(
        [
          spend.pubKey({ utxo: fund.outputs[0]! }),
          output({ address: ctx.address, value: { lovelace: 12n * ADA } }),
        ],
        { payer: ctx.partner },
      );
      await swap.sign();
      const plan = await ctx.builder.plan(
        { swap: swap.partialTx },
        {
          payer: ctx.wallet,
          after: fund,
          knownUtxos: [
            { ...fund.outputs[0]!, value: { lovelace: 900n * ADA } },
          ],
        },
      );
      expect(plan.step("swap").inputs[0]!.value.lovelace).toBe(10n * ADA);
    },
    LONG,
  );

  it(
    "refuses an object that lists another number of outputs than its transaction",
    async () => {
      const ctx = await setup(v);
      const fund = await ctx.builder.build(payTo(alice, 3n * ADA), {
        payer: ctx.wallet,
      });
      expect(fund.outputs.length).toBe(2);
      const short = Object.create(Object.getPrototypeOf(fund));
      Object.defineProperty(short, "partialTx", { value: fund.partialTx });
      Object.defineProperty(short, "outputs", {
        value: fund.outputs.slice(0, 1),
      });
      const error = await caught(
        ctx.builder.plan({ fund: short as BuiltTx }, { payer: ctx.wallet }),
      );
      expect(TxBuildError.is(error, "INVALID_OPTION")).toBe(true);
      expect(error.details).toMatchObject({ option: "steps" });
      expect(error.message).toMatch(
        /step "fund" is an object that lists 1 output\(s\), and its transaction has 2/,
      );
    },
    LONG,
  );

  it(
    "add: a recorded step given built is of no payer, and has no change to link to",
    async () => {
      const ctx = await setup(v);
      // The partner pays the wallet: an output at the wallet's address, not marked change
      const swap = await partnerPays(ctx, ctx.address, 30n * ADA);
      const plan = await ctx.builder.plan(
        { swap: swap.partialTx },
        { payer: ctx.wallet },
      );
      await plan.add({ pay: payTo(alice, 2n * ADA) });
      expect(plan.step("pay").standsOn).toEqual([]);
      const record = plan.toJSON();
      const error = await caught(
        plan.add({
          more: [
            spend.pubKey({ utxo: { step: "swap", change: true } }),
            payTo(carol, 2n * ADA),
          ],
        }),
      );
      expect(TxBuildError.is(error, "INVALID_OPTION")).toBe(true);
      expect(error.message).toMatch(
        /no output marked change: name the output by its position/,
      );
      expect(plan.toJSON()).toEqual(record);
    },
    LONG,
  );

  it(
    "the call's signal ends the wait for what a step given built names",
    async () => {
      const ctx = await setup(v);
      const swap = await partnerPays(ctx, alice, 5n * ADA);
      const held = gate();
      const source = ctx.partnerFunds.input.txHash;
      ctx.provider.control.hooks.fetchUTxOs = async (forward, ...args) => {
        if (args[0] === source) await held.pass();
        return forward(...args);
      };
      const controller = new AbortController();
      const made = caught(
        ctx.builder.plan(
          { swap: swap.partialTx },
          { payer: ctx.wallet, signal: controller.signal },
        ),
      );
      await held.reached;
      controller.abort();
      const error = await Promise.race([
        made,
        new Promise((resolve) => setTimeout(() => resolve("waiting"), 3_000)),
      ]);
      held.open();
      await made;
      expect(TxBuildError.is(error, "ABORTED")).toBe(true);
    },
    LONG,
  );

  it(
    "records the plan payer's change address when every step has a payer of its own",
    async () => {
      const ctx = await storeSetup(v);
      const other = await walletOf(1);
      const otherAddress = (await other.getChangeAddress())!;
      ctx.emulator.fund(otherAddress, { lovelace: 100n * ADA });
      const steps = { a: { parts: payTo(alice, 2n * ADA), payer: other } };
      const options = { payer: ctx.wallet, id: "own-payers" };
      const plan = await ctx.builder.plan(steps, options);
      expect(recordOf(plan).options.changeAddress).toBe(ctx.address);
      const saves = ctx.store.saves().length;
      const again = await ctx.builder.plan(steps, options);
      expect(again.toJSON()).toEqual(plan.toJSON());
      expect(ctx.store.saves().length).toBe(saves);
      // A step added without a payer is the plan payer's
      await again.add({ b: payTo(bob, 1n * ADA) });
      expect(
        again.step("b").inputs.every((u) => u.address === ctx.address),
      ).toBe(true);
    },
    LONG,
  );

  it(
    "rest gives a step given built back with its witness set in the form it came in",
    async () => {
      const ctx = await setup(v);
      const signed = (await partnerPays(ctx, alice, 7n * ADA)).signedTx!;
      // The vkey witnesses without the set tag, over a body whose sets are tagged
      const [body, ws, valid, aux] = topItems(signed);
      const rest = mapPairs(ws!).filter(([key]) => key !== uint(0));
      const untagged = arr(
        body!,
        map([uint(0), witnessEntry(signed, 0)!.slice(6)], ...rest),
        valid!,
        aux!,
      );
      expect(untagged).not.toBe(signed);
      const plan = await ctx.builder.plan(
        { swap: untagged },
        { payer: ctx.wallet },
      );
      expect(plan.step("swap").signedTx).toBe(untagged);
      const back = plan.rest.swap as BuiltTx;
      expect(back.signedTx).toBe(untagged);
    },
    LONG,
  );

  it(
    "sign() with no signer is MISSING_SIGNATURES for a step given built, as for any step",
    async () => {
      const ctx = await setup(v);
      const cbor = await takesFromWallet(ctx);
      // A payer that is an address: the plan holds no signer
      const plan = await ctx.builder.plan(
        { swap: cbor },
        { payer: ctx.address },
      );
      expect(plan.step("swap").status).toBe("built");
      const error = await caught(plan.sign());
      expect(TxPlanError.is(error, "MISSING_SIGNATURES")).toBe(true);
      expect(error.step).toBe("swap");
      expect(error.message).toMatch(
        /nobody in this call can sign: give signers, a payer that signs, or addWitnesses/,
      );
      expect(plan.step("swap").status).toBe("built");
    },
    LONG,
  );

  it(
    "refuses a witness for a step given built that does not verify, and keeps none of a key it does not need",
    async () => {
      await Crypto.ready();
      const ctx = await setup(v);
      const cbor = await takesFromWallet(ctx);
      const plan = await ctx.builder.plan(
        { swap: cbor },
        { payer: ctx.address },
      );
      const record = plan.toJSON();
      const key = testKey();
      // A signature of another body
      const forged = hashSigner("object", () => [
        { vkey: key.vkey, signature: key.sign("cd".repeat(32)) },
      ]);
      const error = await caught(plan.sign({ signers: forged.signer }));
      expect(TxPlanError.is(error, "SIGNER_FAILED")).toBe(true);
      expect(error.step).toBe("swap");
      expect(forged.requests).toHaveLength(1);
      expect(plan.toJSON()).toEqual(record);
      // A signature of the body by a key the step does not need
      const other = hashSigner("object", ({ txHash }) => [key.answer(txHash)]);
      await plan.sign({ signers: other.signer });
      expect(other.requests).toHaveLength(1);
      expect(plan.toJSON()).toEqual(record);
      expect(plan.step("swap").status).toBe("built");
    },
    LONG,
  );
});
