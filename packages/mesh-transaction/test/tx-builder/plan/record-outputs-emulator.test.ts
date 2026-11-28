import type { MeshWallet } from "@meshsdk/wallet";
import { mConStr0 } from "@meshsdk/core";

import {
  collateral,
  collateralReturn,
  output,
  spend,
  TxBuilder,
  TxPlanError,
} from "../../../src/tx-builder";
import { readPlan } from "../../../src/tx-builder/plan/json";
import { alwaysSucceedCbor } from "../../test-util";
import {
  builderOf,
  hashOf,
  VALIDATORS,
  walletOf,
  wrap,
} from "./plan-emulator-util";
import { ADA, alice, bob, payTo, stepSetup } from "./run-util";

// The record's reader believes a step's bytes for its outputs: a record that states another
// address, value, datum or change output than the bytes make is refused, and only what bytes
// cannot say (labels, change marks) is taken as written.

const LONG = 120_000;

const script = { code: alwaysSucceedCbor, version: "V3" as const };

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

/** The JSON of a record with an edit, read back: the error it is refused with */
const refusal = (json: unknown, edit: (json: any) => void) => {
  const copy = JSON.parse(JSON.stringify(json));
  edit(copy);
  try {
    readPlan(copy);
  } catch (error) {
    return error as TxPlanError;
  }
  throw new Error("the record was read");
};

const expectRefused = (error: TxPlanError, message: RegExp) => {
  expect(TxPlanError.is(error, "INVALID_STATE")).toBe(true);
  expect(error.details).toEqual({ reason: "recordVersion" });
  expect(error.message).toMatch(message);
};

describe.each(VALIDATORS)(
  "the record's reader and the outputs of a step (%s)",
  (v) => {
    it(
      "refuses a prebuilt step called a consolidation step whose stated outputs pay the payer, and asks no signer",
      async () => {
        const ctx = await stepSetup(v, {
          funds: [1000n * ADA, 20n * ADA],
        });
        const partner = await walletOf(1);
        const partnerAddress = (await partner.getChangeAddress())!;
        ctx.emulator.fund(partnerAddress, { lovelace: 100n * ADA });
        const swap = await builderOf(wrap(ctx.emulator)).build(
          [
            spend.pubKey({ utxo: ctx.funded[1]! }),
            output({ address: partnerAddress, value: { lovelace: 15n * ADA } }),
          ],
          { payer: partner },
        );
        await swap.sign();
        const { payer, seen } = recording(ctx.wallet);
        const plan = await ctx.builder.plan(
          { swap: swap.partialTx, pay: payTo(alice, 5n * ADA) },
          { payer },
        );
        const json = JSON.parse(JSON.stringify(plan.toJSON()));
        const step = json.steps.find(
          (s: { name: string }) => s.name === "swap",
        );
        step.kind = "consolidation";
        for (const each of step.tx.built.outputs)
          each.address = json.options.changeAddress;
        let error: unknown;
        try {
          await (await ctx.builder.resume(json, { payer })).sign();
        } catch (thrown) {
          error = thrown;
        }
        expectRefused(
          error as TxPlanError,
          /steps\[0\]\.tx\.built\.outputs\[0\] is not output 0 of the transaction/,
        );
        expect(seen).toEqual([]);
      },
      LONG,
    );

    it(
      "refuses an edited output address, value, datum or change output, and reads every record as written",
      async () => {
        const ctx = await stepSetup(v, { funds: [1000n * ADA] });
        const vault = ctx.builder.scriptAddress(script);
        const plan = await ctx.builder.plan(
          {
            lock: output({
              address: vault,
              value: { lovelace: 10n * ADA },
              datum: { type: "inline", data: mConStr0([]) },
              label: "vault",
            }),
            unlock: [
              spend.plutus({
                utxo: { step: "lock", output: "vault" },
                script,
                redeemer: { data: mConStr0([]) },
              }),
              payTo(alice, 4n * ADA),
            ],
          },
          { payer: ctx.wallet },
        );
        const json = plan.toJSON();
        // As written, it reads back, labels and change marks included
        const read = readPlan(JSON.parse(JSON.stringify(json)));
        expect(read.steps[0]!.built.outputs[0]!.label).toBe("vault");
        expect(read.steps[0]!.built.change.length).toBeGreaterThan(0);
        const lock = (j: any) => j.steps[0].tx.built;
        const outputAt = /steps\[0\]\.tx\.built\.outputs\[0\] is not output 0/;
        expectRefused(
          refusal(json, (j) => (lock(j).outputs[0].address = alice)),
          outputAt,
        );
        expectRefused(
          refusal(
            json,
            (j) => (lock(j).outputs[0].value.lovelace = String(900n * ADA)),
          ),
          outputAt,
        );
        expectRefused(
          refusal(json, (j) => delete lock(j).outputs[0].datum),
          outputAt,
        );
        expectRefused(
          refusal(json, (j) => {
            lock(j).outputs.pop();
            lock(j).change = [];
          }),
          /steps\[0\]\.tx\.built\.outputs are 1, and the transaction makes 2/,
        );
        // A change output written whole that the bytes do not make
        expectRefused(
          refusal(json, (j) => {
            const built = lock(j);
            const place = built.change[0];
            const written =
              typeof place === "number" ? { ...built.outputs[place] } : place;
            built.change[0] = {
              ...written,
              value: { ...written.value, lovelace: String(900n * ADA) },
            };
          }),
          /steps\[0\]\.tx\.built\.change\[0\] is not an output of the transaction/,
        );
        // A label is the record's word: moved, it still reads
        const moved = JSON.parse(JSON.stringify(json));
        delete lock(moved).outputs[0].label;
        lock(moved).outputs[1].label = "vault";
        expect(readPlan(moved).steps[0]!.built.outputs[1]!.label).toBe("vault");
      },
      LONG,
    );

    it(
      "refuses an edited collateral return or total, and reads every Plutus record as written",
      async () => {
        const ctx = await stepSetup(v, {
          funds: [1000n * ADA, 20n * ADA],
        });
        const vault = ctx.builder.scriptAddress(script);
        const steps = {
          lock: output({
            address: vault,
            value: { lovelace: 10n * ADA },
            datum: { type: "inline", data: mConStr0([]) },
            label: "vault",
          }),
          unlock: [
            spend.plutus({
              utxo: { step: "lock", output: "vault" },
              script,
              redeemer: { data: mConStr0([]) },
            }),
            payTo(alice, 4n * ADA),
          ],
        };
        const plan = await ctx.builder.plan(steps, { payer: ctx.wallet });
        const json = JSON.parse(JSON.stringify(plan.toJSON()));
        const unlock = (j: any) => j.steps[1].tx.built;
        expect(unlock(json).collateral.return).toBeDefined();
        expect(readPlan(json).steps[1]!.built.collateral!.return).toBeDefined();
        await ctx.builder.resume(json, { payer: ctx.wallet });
        const returned = (j: any) => {
          const built = unlock(j);
          const place = built.collateral.return;
          // Written whole, or by its place among the outputs
          if (typeof place === "number")
            built.collateral.return = { ...built.outputs[place] };
          return built.collateral.return;
        };
        const notReturn =
          /steps\[1\]\.tx\.built\.collateral\.return is not the collateral return of the transaction/;
        expectRefused(
          refusal(json, (j) => (returned(j).address = bob)),
          notReturn,
        );
        expectRefused(
          refusal(json, (j) => {
            const value = returned(j).value;
            value.lovelace = String(BigInt(value.lovelace) + 900n * ADA);
          }),
          notReturn,
        );
        expectRefused(
          refusal(
            json,
            (j) =>
              (returned(j).datum = { type: "hash", hash: "00".repeat(32) }),
          ),
          notReturn,
        );
        expectRefused(
          refusal(json, (j) => delete unlock(j).collateral.return),
          /collateral\.return is not recorded, and the transaction has a collateral return/,
        );
        expectRefused(
          refusal(json, (j) => (unlock(j).collateral.total = "1")),
          /collateral\.total is not the total collateral of the transaction/,
        );

        // No collateral return: the total is the lovelace of the collateral inputs
        const bare = await ctx.builder.plan(
          { ...steps },
          { payer: ctx.wallet, collateralReturn: false },
        );
        const bareJson = JSON.parse(JSON.stringify(bare.toJSON()));
        expect(unlock(bareJson).collateral.return).toBeUndefined();
        readPlan(bareJson);
        await ctx.builder.resume(bareJson, { payer: ctx.wallet });
        expectRefused(
          refusal(bareJson, (j) => {
            const built = unlock(j);
            built.collateral.return = {
              ...built.collateral.inputs[0],
              txHash: j.steps[1].txHash,
              outputIndex: built.outputs.length,
            };
          }),
          /collateral\.return is recorded, and the transaction has no collateral return/,
        );
        expectRefused(
          refusal(bareJson, (j) => {
            const built = unlock(j);
            built.collateral.total = String(
              BigInt(built.collateral.total) - 1n,
            );
          }),
          /collateral\.total is not the total collateral of the transaction/,
        );

        // A step given built by another party, with a collateral return of its own
        const partner = await walletOf(1);
        const partnerAddress = (await partner.getChangeAddress())!;
        ctx.emulator.fund(partnerAddress, { lovelace: 100n * ADA });
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
        const swap = await new TxBuilder({
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
            collateral({ utxo: ctx.funded[1]!.input }),
            collateralReturn({ address: partnerAddress }),
          ],
          { payer: partnerAddress },
        );
        const withSwap = await ctx.builder.plan(
          { swap: swap.tx, pay: payTo(alice, 5n * ADA) },
          { payer: ctx.wallet },
        );
        const swapJson = JSON.parse(JSON.stringify(withSwap.toJSON()));
        const swapBuilt = swapJson.steps[0].tx.built;
        expect(swapBuilt.collateral.return).toBeDefined();
        readPlan(swapJson);
        await ctx.builder.resume(swapJson, { payer: ctx.wallet });
        expectRefused(
          refusal(swapJson, (j) => {
            const built = j.steps[0].tx.built;
            const place = built.collateral.return;
            const whole =
              typeof place === "number" ? { ...built.outputs[place] } : place;
            built.collateral.return = { ...whole, address: partnerAddress };
            if (whole.address === partnerAddress)
              built.collateral.return.address = alice;
          }),
          /steps\[0\]\.tx\.built\.collateral\.return is not the collateral return of the transaction/,
        );
      },
      LONG,
    );

    it(
      "refuses an edited reference script or out ref of an output",
      async () => {
        const ctx = await stepSetup(v, { funds: [1000n * ADA] });
        const plan = await ctx.builder.plan(
          {
            hold: [
              output({
                address: alice,
                value: { lovelace: 20n * ADA },
                scriptRef: script,
                label: "ref",
              }),
              payTo(bob, 3n * ADA),
            ],
          },
          { payer: ctx.wallet },
        );
        const json = JSON.parse(JSON.stringify(plan.toJSON()));
        const hold = (j: any) => j.steps[0].tx.built;
        expect(hold(json).outputs[0].script).toBeDefined();
        readPlan(json);
        const first = /steps\[0\]\.tx\.built\.outputs\[0\] is not output 0/;
        const second = /steps\[0\]\.tx\.built\.outputs\[1\] is not output 1/;
        expectRefused(
          refusal(json, (j) => delete hold(j).outputs[0].script),
          first,
        );
        expectRefused(
          refusal(json, (j) => {
            const each = hold(j).outputs[0].script;
            each.code = `${each.code.slice(0, -2)}00`;
          }),
          first,
        );
        expectRefused(
          refusal(
            json,
            (j) => (hold(j).outputs[0].script.hash = "33".repeat(28)),
          ),
          first,
        );
        expectRefused(
          refusal(
            json,
            (j) =>
              (hold(j).outputs[1].script = { ...hold(j).outputs[0].script }),
          ),
          second,
        );
        expectRefused(
          refusal(json, (j) => (hold(j).outputs[1].outputIndex = 9)),
          second,
        );
        expectRefused(
          refusal(json, (j) => (hold(j).outputs[1].txHash = "44".repeat(32))),
          second,
        );
      },
      LONG,
    );
  },
);
