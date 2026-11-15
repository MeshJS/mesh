import { mConStr0 } from "@meshsdk/core";
import { Crypto, resolvePlutusScriptAddress } from "@meshsdk/core-cst";

import type { UtxoInput } from "../../../src/tx-builder";
import {
  collateral,
  collateralReturn,
  output,
  referenceInput,
  spend,
  TxBuilder,
  TxBuildError,
} from "../../../src/tx-builder";
import { alwaysSucceedCbor } from "../../test-util";
import { arr, map, uint, vkeyWitness } from "../cbor-util";
import { testKey } from "../hash-signer-util";
import { builderOf, caught, walletOf, wrap } from "./plan-emulator-util";
import { ADA, alice, bob, carol, paidTo, payTo, stepSetup } from "./run-util";

// What a step given built reads or puts up as collateral is kept for it: no step the plan builds
// selects or spends it, before or after it, also through add; two steps may read one output or
// put up one UTxO as collateral.

const LONG = 120_000;

type OutRef = { txHash: string; outputIndex: number };

/** An out ref as text, of a Utxo or of a Mesh UTxO */
const ref = (u: OutRef | { input: OutRef }) => {
  const { txHash, outputIndex } = "input" in u ? u.input : u;
  return `${txHash}#${outputIndex}`;
};

const script = { code: alwaysSucceedCbor, version: "V3" as const };

/**
 * An emulator, the plan's builder and wallet with UTxOs of these amounts, a maker with funds of
 * its own, and script outputs to unlock
 */
const setup = async (funds: bigint[]) => {
  await Crypto.ready();
  const ctx = await stepSetup("scalus", { funds });
  const maker = testKey();
  ctx.emulator.fund(maker.address, { lovelace: 50n * ADA });
  const lockAt = (h: string) => {
    const input = { txHash: h.repeat(32), outputIndex: 0 };
    ctx.emulator.addUtxos([
      {
        input,
        output: {
          address: resolvePlutusScriptAddress(script, 0),
          amount: [{ unit: "lovelace", quantity: "20000000" }],
          plutusData: "d87980",
        },
      },
    ]);
    return input;
  };
  const makerBuilder = new TxBuilder({
    network: "preprod",
    provider: ctx.emulator,
    evaluator: ctx.emulator,
  });
  /**
   * The maker's transaction that unlocks a script output with the wallet's UTxO as collateral,
   * the return at the maker's address, signed by the maker; the wallet's key is left to sign
   */
  const withCollateral = async (utxo: UtxoInput, lock = "ab") => {
    const built = await makerBuilder.build(
      [
        spend.plutus({
          utxo: lockAt(lock),
          script,
          redeemer: { data: mConStr0([]) },
        }),
        collateral({ utxo }),
        collateralReturn({ address: maker.address }),
      ],
      { payer: maker.address },
    );
    await built.addWitnesses(
      map([uint(0), arr(vkeyWitness(maker, built.txHash))]),
    );
    return built;
  };
  return { ...ctx, maker, makerBuilder, lockAt, withCollateral };
};

const expectSteps = (error: unknown, message: RegExp) => {
  expect(TxBuildError.is(error, "INVALID_OPTION")).toBe(true);
  expect((error as TxBuildError).details).toMatchObject({ option: "steps" });
  expect((error as Error).message).toMatch(message);
};

describe("what a step given built reads or puts up is kept for it", () => {
  it(
    "keeps the collateral of a prebuilt step from the selection of a step before it, and both land",
    async () => {
      const ctx = await setup([20n * ADA, 8n * ADA]);
      const x = ctx.funded[0]!;
      const built = await ctx.withCollateral(x);
      // The wallet signs for its collateral before it gives the transaction
      const swap = await ctx.builder.fromCbor(built.partialTx);
      await swap.sign({ signers: ctx.wallet });
      expect(swap.missing).toEqual([]);
      for (const steps of [
        { swap, a: payTo(alice, 5n * ADA) },
        { a: payTo(alice, 5n * ADA), swap },
      ]) {
        const plan = await ctx.builder.plan(steps, { payer: ctx.wallet });
        expect(plan.step("a").inputs.map(ref)).not.toContain(ref(x));
        expect(plan.step("swap").collateral!.inputs.map(ref)).toEqual([ref(x)]);
        if (Object.keys(steps)[0] === "a") {
          await plan.run();
          expect(plan.status).toBe("final");
          expect(paidTo(ctx.emulator, alice)).toEqual([5n * ADA]);
        }
      }
    },
    LONG,
  );

  it(
    "refuses a step that has nothing else to select, its name first",
    async () => {
      const ctx = await setup([20n * ADA]);
      const built = await ctx.withCollateral(ctx.funded[0]!);
      const error = await caught(
        ctx.builder.plan(
          { a: payTo(alice, 5n * ADA), swap: built.partialTx },
          { payer: ctx.wallet },
        ),
      );
      expect(TxBuildError.is(error, "INSUFFICIENT_FUNDS")).toBe(true);
      expect(error.message).toMatch(/^step "a": /);
    },
    LONG,
  );

  it(
    "refuses a step that spends what a prebuilt step puts up as collateral, before it or after it",
    async () => {
      const ctx = await setup([20n * ADA, 8n * ADA]);
      const x = ctx.funded[0]!;
      const built = await ctx.withCollateral(x);
      const takeX = [spend.pubKey({ utxo: x }), payTo(bob, 3n * ADA)];
      for (const steps of [
        { b: takeX, swap: built.partialTx },
        { swap: built.partialTx, b: takeX },
      ])
        expectSteps(
          await caught(ctx.builder.plan(steps, { payer: ctx.wallet })),
          new RegExp(
            `step "b" spends ${ref(x)}, which step "swap" puts up as collateral`,
          ),
        );
    },
    LONG,
  );

  it(
    "refuses a prebuilt step that reads what another step spends, either way round",
    async () => {
      const ctx = await setup([100n * ADA]);
      const partner = await walletOf(1);
      const partnerAddress = (await partner.getChangeAddress())!;
      const own = ctx.emulator.fund(partnerAddress, { lovelace: 100n * ADA });
      const read = ctx.emulator.fund(partnerAddress, { lovelace: 10n * ADA });
      const partnerBuilder = builderOf(wrap(ctx.emulator));
      const signed = async (parts: Parameters<TxBuilder["build"]>[0]) => {
        const tx = await partnerBuilder.build(parts, {
          payer: { changeAddress: partnerAddress, utxos: [own] },
        });
        await tx.sign({ signers: partner });
        return tx.partialTx;
      };
      const spends = await signed([
        spend.pubKey({ utxo: read }),
        output({ address: alice, value: { lovelace: 2n * ADA } }),
      ]);
      const reads = await signed([
        referenceInput({ utxo: read }),
        output({ address: bob, value: { lovelace: 2n * ADA } }),
      ]);
      expectSteps(
        await caught(
          ctx.builder.plan({ spends, reads }, { payer: ctx.wallet }),
        ),
        new RegExp(
          `step "reads" reads ${ref(read)}, which step "spends" spends`,
        ),
      );
      expectSteps(
        await caught(
          ctx.builder.plan({ reads, spends }, { payer: ctx.wallet }),
        ),
        new RegExp(
          `step "spends" spends ${ref(read)}, which step "reads" reads`,
        ),
      );
      // A step the plan builds may read it too
      const plan = await ctx.builder.plan(
        {
          reads,
          also: [referenceInput({ utxo: read }), payTo(carol, 2n * ADA)],
        },
        { payer: ctx.wallet },
      );
      expect(plan.step("also").referenceInputs.map(ref)).toEqual([ref(read)]);
    },
    LONG,
  );

  it(
    "lets a step the plan builds put up the same collateral",
    async () => {
      const ctx = await setup([20n * ADA, 8n * ADA]);
      const x = ctx.funded[0]!;
      const built = await ctx.withCollateral(x);
      const plan = await ctx.builder.plan(
        {
          swap: built.partialTx,
          b: [
            spend.plutus({
              utxo: ctx.lockAt("cd"),
              script,
              redeemer: { data: mConStr0([]) },
            }),
            collateral({ utxo: x }),
            payTo(alice, 2n * ADA),
          ],
        },
        { payer: ctx.wallet },
      );
      expect(plan.step("b").collateral!.inputs.map(ref)).toContain(ref(x));
      expect(plan.step("b").inputs.map(ref)).not.toContain(ref(x));
    },
    LONG,
  );

  it(
    "keeps it through add, for a recorded prebuilt step that is not final",
    async () => {
      const ctx = await setup([20n * ADA, 8n * ADA]);
      const x = ctx.funded[0]!;
      const built = await ctx.withCollateral(x);
      const plan = await ctx.builder.plan(
        { swap: built.partialTx },
        { payer: ctx.wallet },
      );
      await plan.add({ a: payTo(alice, 5n * ADA) });
      expect(plan.step("a").inputs.map(ref)).not.toContain(ref(x));
      const record = plan.toJSON();
      expectSteps(
        await caught(
          plan.add({ b: [spend.pubKey({ utxo: x }), payTo(bob, 3n * ADA)] }),
        ),
        new RegExp(
          `step "b" spends ${ref(x)}, which step "swap" puts up as collateral`,
        ),
      );
      expect(plan.toJSON()).toEqual(record);
    },
    LONG,
  );
});
