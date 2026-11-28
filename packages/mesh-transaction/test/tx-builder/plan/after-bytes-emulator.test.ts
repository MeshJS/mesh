import { mConStr0 } from "@meshsdk/core";
import { Address, Crypto } from "@meshsdk/core-cst";

import type { BuiltTx } from "../../../src/tx-builder";
import {
  collateral,
  collateralReturn,
  metadata,
  output,
  referenceInput,
  spend,
  TxBuilder,
  TxBuildError,
} from "../../../src/tx-builder";
import { recordOf } from "../../../src/tx-builder/plan/plan";
import { alwaysSucceedCbor } from "../../test-util";
import { arr, bytes, head, map, tx as txOf, uint } from "../cbor-util";
import {
  builderOf,
  caught,
  VALIDATORS,
  walletOf,
  wrap,
} from "./plan-emulator-util";
import { ADA, alice, bob, payTo, stepSetup } from "./run-util";

// A transaction given in `after`, to a build or to a plan, is read from its own bytes: what it
// spends and the outputs it makes are never those its object states, which a JSON another
// party wrote can make up. Only the change marks of the object are taken.

const LONG = 120_000;

/** A transaction of `n` plain outputs to alice, spending one made-up input */
const manyOutputs = (n: number, aux = "f6") => {
  const one = arr(bytes(Address.fromBech32(alice).toBytes()), uint(2_000_000));
  const body = map(
    [uint(0), arr(arr(bytes("77".repeat(32)), uint(0)))],
    [uint(1), head(4, n) + one.repeat(n)],
    [uint(2), uint(200_000)],
  );
  return txOf(body, map(), { aux });
};

const script = { code: alwaysSucceedCbor, version: "V3" as const };

/** An out ref as text */
const ref = (u: { txHash: string; outputIndex: number }) =>
  `${u.txHash}#${u.outputIndex}`;

/** The JSON of an object with an edit, restored on the builder: the object another party sent */
const restoredWith = async (
  builder: Awaited<ReturnType<typeof stepSetup>>["builder"],
  built: BuiltTx,
  edit: (json: any) => void,
) => {
  const json = JSON.parse(JSON.stringify(built.toJSON()));
  edit(json);
  return builder.restore(json);
};

const expectAfter = (error: unknown, message?: RegExp) => {
  expect(TxBuildError.is(error, "INVALID_OPTION")).toBe(true);
  expect((error as TxBuildError).details).toMatchObject({ option: "after" });
  if (message !== undefined) expect((error as Error).message).toMatch(message);
};

describe.each(VALIDATORS)(
  "a transaction of after is read from its bytes (%s)",
  (v) => {
    it(
      "a build spends an output of it as the bytes make it, whatever address and value the object states",
      async () => {
        const ctx = await stepSetup(v, { funds: [1000n * ADA] });
        const partner = await walletOf(1);
        const partnerAddress = (await partner.getChangeAddress())!;
        const fund = await ctx.builder.build(
          output({ address: ctx.address, value: { lovelace: 10n * ADA } }),
          { payer: ctx.wallet },
        );
        const fake = await restoredWith(ctx.builder, fund, (json) => {
          json.built.outputs[0].address = partnerAddress;
          json.built.outputs[0].value.lovelace = String(900n * ADA);
        });
        expect(fake.outputs[0]!.value.lovelace).toBe(900n * ADA);
        const built = await ctx.builder.build(
          [
            spend.pubKey({ utxo: { txHash: fund.txHash, outputIndex: 0 } }),
            payTo(alice, 5n * ADA),
          ],
          { payer: ctx.wallet, after: fake },
        );
        const spent = built.inputs.find(
          (u) => ref(u) === ref(fund.outputs[0]!),
        )!;
        expect(spent.address).toBe(ctx.address);
        expect(spent.value.lovelace).toBe(10n * ADA);
        // The same in a plan, for a step it builds
        const plan = await ctx.builder.plan(
          {
            take: [
              spend.pubKey({ utxo: { txHash: fund.txHash, outputIndex: 0 } }),
              payTo(bob, 5n * ADA),
            ],
          },
          { payer: ctx.wallet, after: fake },
        );
        const taken = plan
          .step("take")
          .inputs.find((u) => ref(u) === ref(fund.outputs[0]!))!;
        expect(taken.value.lovelace).toBe(10n * ADA);
        expect(recordOf(plan).steps[0]!.after).toEqual([fund.txHash]);
      },
      LONG,
    );

    it(
      "selects the change of it by its true value",
      async () => {
        const ctx = await stepSetup(v, { funds: [100n * ADA] });
        const fund = await ctx.builder.build(payTo(alice, 5n * ADA), {
          payer: ctx.wallet,
        });
        const change = fund.change[0]!;
        const fake = await restoredWith(ctx.builder, fund, (json) => {
          json.built.outputs[change.outputIndex].value.lovelace = String(
            5000n * ADA,
          );
          json.built.change[0].value.lovelace = String(5000n * ADA);
        });
        const error = await caught(
          ctx.builder.build(payTo(bob, 1000n * ADA), {
            payer: ctx.wallet,
            after: fake,
          }),
        );
        expect(TxBuildError.is(error, "INSUFFICIENT_FUNDS")).toBe(true);
        // Its change marks are taken: the true change is selectable
        const built = await ctx.builder.build(payTo(bob, 50n * ADA), {
          payer: ctx.wallet,
          after: fake,
        });
        expect(built.inputs.map(ref)).toContain(ref(change));
      },
      LONG,
    );

    it(
      "evaluates a Plutus spend of an output of it with the datum its bytes hold",
      async () => {
        const ctx = await stepSetup(v, { funds: [1000n * ADA] });
        const vault = ctx.builder.scriptAddress(script);
        const lock = await ctx.builder.build(
          output({
            address: vault,
            value: { lovelace: 10n * ADA },
            datum: { type: "inline", data: mConStr0([]) },
          }),
          { payer: ctx.wallet },
        );
        expect(lock.outputs[0]!.datum?.type).toBe("inline");
        const fake = await restoredWith(ctx.builder, lock, (json) => {
          delete json.built.outputs[0].datum;
        });
        expect(fake.outputs[0]!.datum).toBeUndefined();
        const unlock = await ctx.builder.build(
          [
            spend.plutus({
              utxo: { txHash: lock.txHash, outputIndex: 0 },
              script,
              redeemer: { data: mConStr0([]) },
            }),
            payTo(alice, 4n * ADA),
          ],
          { payer: ctx.wallet, after: fake },
        );
        const spent = unlock.inputs.find(
          (u) => ref(u) === ref(lock.outputs[0]!),
        )!;
        expect(spent.datum).toEqual(lock.outputs[0]!.datum);
      },
      LONG,
    );

    it(
      "does not believe the inputs it states",
      async () => {
        const ctx = await stepSetup(v, {
          funds: [1000n * ADA, 50n * ADA],
        });
        const [x, y] = [ctx.funded[0]!.input, ctx.funded[1]!.input];
        const fund = await ctx.builder.build(
          [spend.pubKey({ utxo: x }), payTo(alice, 5n * ADA)],
          { payer: ctx.wallet, canSelect: () => false },
        );
        const fake = await restoredWith(ctx.builder, fund, (json) => {
          json.built.inputs = [
            {
              ...json.built.inputs[0],
              txHash: y.txHash,
              outputIndex: y.outputIndex,
            },
          ];
        });
        expect(ref(fake.inputs[0]!)).toBe(ref(y));
        // What the bytes spend is spent; what the object names in its place is not
        const error = await caught(
          ctx.builder.build([spend.pubKey({ utxo: x }), payTo(bob, 1n * ADA)], {
            payer: ctx.wallet,
            after: fake,
          }),
        );
        expect(TxBuildError.is(error, "UTXO_NOT_FOUND")).toBe(true);
        const built = await ctx.builder.build(
          [spend.pubKey({ utxo: y }), payTo(bob, 1n * ADA)],
          { payer: ctx.wallet, after: fake },
        );
        expect(built.inputs.map(ref)).toContain(ref(y));
        // A step given built that spends what the bytes of after spend is refused
        const partnerBuilder = builderOf(wrap(ctx.emulator));
        const other = await partnerBuilder.build(
          [spend.pubKey({ utxo: ctx.funded[0]! }), payTo(bob, 2n * ADA)],
          { payer: ctx.address },
        );
        const refused = await caught(
          ctx.builder.plan(
            { other: other.tx },
            { payer: ctx.wallet, after: fake },
          ),
        );
        expect(TxBuildError.is(refused, "INVALID_OPTION")).toBe(true);
        expect(refused.message).toMatch(
          new RegExp(
            `spends ${ref(x)}, which the transaction ${fund.txHash} of after spends`,
          ),
        );
      },
      LONG,
    );

    it(
      "refuses an entry whose bytes are not read, or that lists another number of outputs, and a value that is no transaction",
      async () => {
        const ctx = await stepSetup(v, { funds: [1000n * ADA] });
        const fund = await ctx.builder.build(payTo(alice, 5n * ADA), {
          payer: ctx.wallet,
        });
        const partnerBuilder = builderOf(wrap(ctx.emulator));
        const partner = await walletOf(1);
        const partnerAddress = (await partner.getChangeAddress())!;
        ctx.emulator.fund(partnerAddress, { lovelace: 100n * ADA });
        const prebuilt = await partnerBuilder.build(payTo(bob, 2n * ADA), {
          payer: partner,
        });
        await prebuilt.sign();
        for (const [after, message] of [
          [{ ...fund, tx: "00" }, /holds no transaction this library reads/],
          [{ tx: 7, outputs: [] }, /holds no transaction this library reads/],
          [
            { ...fund, outputs: fund.outputs.slice(0, 1) },
            /lists 1 output\(s\), and its transaction has 2/,
          ],
          [{ txHash: fund.txHash }, /is not a built transaction/],
          [5, /expected/],
          [[fund, null], /entry 1 is not a built transaction/],
        ] as const) {
          for (const call of [
            () =>
              ctx.builder.build(payTo(bob, 1n * ADA), {
                payer: ctx.wallet,
                after: after as never,
              }),
            () =>
              ctx.builder.plan(
                { only: prebuilt.partialTx },
                { payer: ctx.wallet, after: after as never },
              ),
          ]) {
            const error = await caught(call());
            expectAfter(error, message);
            expect(typeof error.details.value).toBe("string");
            expect(JSON.stringify(error.details)).not.toContain(fund.tx);
          }
        }
      },
      LONG,
    );

    it(
      "takes an object of build in after as before",
      async () => {
        const ctx = await stepSetup(v, { funds: [100n * ADA] });
        const fund = await ctx.builder.build(payTo(alice, 5n * ADA), {
          payer: ctx.wallet,
        });
        for (const after of [fund, { ...fund }, [fund]]) {
          const next = await ctx.builder.build(payTo(bob, 3n * ADA), {
            payer: ctx.wallet,
            after: after as never,
          });
          expect(next.inputs.map(ref)).toContain(ref(fund.change[0]!));
        }
      },
      LONG,
    );

    it(
      "takes a transaction larger than the default maximum on a builder whose parameters allow it",
      async () => {
        const ctx = await stepSetup(v, { funds: [1000n * ADA] });
        const params = await ctx.emulator.fetchProtocolParameters();
        const big = builderOf(wrap(ctx.emulator), {
          params: { ...params, maxTxSize: 65_536 },
        });
        const entries = Object.fromEntries(
          Array.from({ length: 300 }, (_, i) => [String(i), "x".repeat(64)]),
        );
        const fund = await big.build(
          [
            payTo(ctx.address, 10n * ADA),
            metadata({ metadataLabel: 674, value: entries }),
          ],
          { payer: ctx.wallet },
        );
        expect(fund.tx.length / 2).toBeGreaterThan(16_384);
        const next = await big.build(payTo(bob, 1n * ADA), {
          payer: ctx.wallet,
          after: fund,
        });
        expect(next.inputs.map(ref)).toContain(ref(fund.change[0]!));
        const plan = await big.plan(
          { next: payTo(bob, 1n * ADA) },
          { payer: ctx.wallet, after: fund },
        );
        expect(plan.step("next").inputs.map(ref)).toContain(
          ref(fund.change[0]!),
        );
      },
      LONG,
    );

    it(
      "reads a transaction of after up to 65 536 bytes on a builder without parameters, and up to their maxTxSize on one with them",
      async () => {
        const ctx = await stepSetup(v, { funds: [1000n * ADA] });
        const params = await ctx.emulator.fetchProtocolParameters();
        const big = builderOf(wrap(ctx.emulator), {
          params: { ...params, maxTxSize: 65_536 },
        });
        const entries = Object.fromEntries(
          Array.from({ length: 300 }, (_, i) => [String(i), "x".repeat(64)]),
        );
        const fund = await big.build(
          [
            payTo(ctx.address, 10n * ADA),
            metadata({ metadataLabel: 674, value: entries }),
          ],
          { payer: ctx.wallet },
        );
        expect(fund.tx.length / 2).toBeGreaterThan(20_000);
        // No parameters given: read up to 65 536 bytes
        const next = await ctx.builder.build(payTo(bob, 1n * ADA), {
          payer: ctx.wallet,
          after: fund,
        });
        expect(next.inputs.map(ref)).toContain(ref(fund.change[0]!));
        // Parameters given: read up to their maxTxSize, here 16 384
        const small = builderOf(wrap(ctx.emulator), {
          params: { ...params, maxTxSize: 16_384 },
        });
        const plan = await small.plan(
          { first: payTo(bob, 1n * ADA) },
          { payer: ctx.wallet },
        );
        for (const call of [
          () =>
            small.build(payTo(bob, 1n * ADA), {
              payer: ctx.wallet,
              after: fund,
            }),
          () =>
            small.plan(
              { next: payTo(bob, 1n * ADA) },
              { payer: ctx.wallet, after: [fund] },
            ),
          () =>
            plan.replan({
              id: "again",
              steps: { next: payTo(bob, 1n * ADA) },
              payer: ctx.wallet,
              after: fund,
            }),
        ]) {
          const error = await caught(call());
          expectAfter(error, /more than the 16384 bytes .*maxTxSize/);
          expect(error.details.value).toBe("object");
          expect(JSON.stringify(error.details)).not.toContain(fund.tx);
          expect(error.message).not.toContain(fund.tx.slice(0, 64));
        }
      },
      LONG,
    );

    it(
      "refuses a larger transaction of after at once, before any of it is read",
      async () => {
        const ctx = await stepSetup(v, { funds: [1000n * ADA] });
        const plan = await ctx.builder.plan(
          { first: payTo(bob, 1n * ADA) },
          { payer: ctx.wallet },
        );
        // 20 000 outputs, 1.3 MB: read, it would take seconds
        const huge = manyOutputs(20_000);
        expect(huge.length / 2).toBeGreaterThan(1_000_000);
        const given = { tx: huge, outputs: [] };
        for (const call of [
          () =>
            ctx.builder.build(payTo(bob, 1n * ADA), {
              payer: ctx.wallet,
              after: given as never,
            }),
          () =>
            ctx.builder.plan(
              { next: payTo(bob, 1n * ADA) },
              { payer: ctx.wallet, after: given as never },
            ),
          () =>
            plan.replan({
              id: "again",
              steps: { next: payTo(bob, 1n * ADA) },
              payer: ctx.wallet,
              after: [given] as never,
            }),
        ]) {
          const calls = () =>
            Object.values(ctx.provider.control.calls).reduce(
              (a, b) => a + b,
              0,
            );
          const asked = calls();
          const start = performance.now();
          const error = await caught(call());
          expect(performance.now() - start).toBeLessThan(500);
          // Refused before any request
          expect(calls()).toBe(asked);
          expectAfter(error, /more than the 65536 bytes .*maxTxSize/);
          expect(error.details.value).toBe("object");
        }
        // Just above the bound
        const above = manyOutputs(1_010);
        expect(above.length / 2).toBeGreaterThan(65_536);
        expectAfter(
          await caught(
            ctx.builder.build(payTo(bob, 1n * ADA), {
              payer: ctx.wallet,
              after: { tx: above, outputs: [] } as never,
            }),
          ),
          /more than the 65536 bytes/,
        );
      },
      LONG,
    );

    it(
      "refuses a transaction of after nested deeper than the walk reads",
      async () => {
        const ctx = await stepSetup(v, { funds: [1000n * ADA] });
        // The same transaction with metadata nested 100 and 1 100 levels
        const shallow = manyOutputs(
          1,
          map([uint(674), "81".repeat(100) + "00"]),
        );
        const deep = manyOutputs(
          1,
          map([uint(674), "81".repeat(1_100) + "00"]),
        );
        const built = await ctx.builder.build(payTo(bob, 1n * ADA), {
          payer: ctx.wallet,
          after: { tx: shallow, outputs: [{}] } as never,
        });
        expect(built.txHash).toMatch(/^[0-9a-f]{64}$/);
        expectAfter(
          await caught(
            ctx.builder.build(payTo(bob, 1n * ADA), {
              payer: ctx.wallet,
              after: { tx: deep, outputs: [{}] } as never,
            }),
          ),
          /holds no transaction this library reads/,
        );
      },
      LONG,
    );

    it(
      "refuses a prebuilt step that reads or puts up as collateral what a transaction of after spends",
      async () => {
        await Crypto.ready();
        const ctx = await stepSetup(v, {
          funds: [20n * ADA, 500n * ADA],
        });
        const partner = await walletOf(1);
        const partnerAddress = (await partner.getChangeAddress())!;
        ctx.emulator.fund(partnerAddress, { lovelace: 100n * ADA });
        const vault = ctx.builder.scriptAddress(script);
        const locked = { txHash: "ab".repeat(32), outputIndex: 0 };
        ctx.emulator.addUtxos([
          {
            input: locked,
            output: {
              address: vault,
              amount: [{ unit: "lovelace", quantity: "20000000" }],
              plutusData: "d87980",
            },
          },
        ]);
        const small = ctx.funded[0]!.input;
        // The application's own transaction of after spends small
        const own = await ctx.builder.build(
          [spend.pubKey({ utxo: small }), payTo(alice, 5n * ADA)],
          { payer: ctx.wallet },
        );
        // The partner's: one puts small up as collateral, one reads it
        const putsUp = await new TxBuilder({
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
            collateral({ utxo: small }),
            collateralReturn({ address: partnerAddress }),
          ],
          { payer: partnerAddress },
        );
        const reads = await builderOf(wrap(ctx.emulator)).build(
          [referenceInput({ utxo: small }), payTo(bob, 2n * ADA)],
          { payer: partner },
        );
        await reads.sign();
        for (const [tx, use] of [
          [putsUp.tx, "puts up as collateral"],
          [reads.partialTx, "reads"],
        ] as const) {
          const error = await caught(
            ctx.builder.plan({ swap: tx }, { payer: ctx.wallet, after: own }),
          );
          expect(TxBuildError.is(error, "INVALID_OPTION")).toBe(true);
          expect(error.details).toMatchObject({ option: "steps" });
          expect(error.message).toMatch(
            new RegExp(
              `step "swap" ${use} ${ref(small)}, which the transaction ${own.txHash} of after spends`,
            ),
          );
        }
      },
      LONG,
    );
  },
);
