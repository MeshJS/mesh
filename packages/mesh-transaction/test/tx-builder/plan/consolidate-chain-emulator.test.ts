import { mConStr0 } from "@meshsdk/core";
import { resolvePlutusScriptAddress } from "@meshsdk/core-cst";

import type { SelectInputs, Utxo } from "../../../src/tx-builder";
import {
  collateral,
  output,
  referenceInput,
  spend,
} from "../../../src/tx-builder";
import { alwaysSucceedCbor } from "../../test-util";
import {
  coins,
  consolidationsOf,
  fragmented,
  keyOf,
  pay,
  sumOf,
} from "./consolidate-util";
import { recipient } from "./plan-emulator-util";
import { ADA, alice, paidTo } from "./run-util";

// The first consolidation step made for a step stands on the step before it of its payer, by
// that step's change, also when the served step links to another output of that step; and a
// consolidation step that stands on nothing takes no UTxO an earlier step reads or puts up.

const LONG = 300_000;
const script = { code: alwaysSucceedCbor, version: "V3" as const };

describe("a consolidation step and the step before it", () => {
  it(
    "stands on the change of the step before it when the served step links to another output of that step",
    async () => {
      const { emulator, builder, wallet, address } = await fragmented(
        coins(300, 2n * ADA),
        { maxTxSize: 4096 },
      );
      const plan = await builder.plan(
        {
          a: [
            output({ address, value: { lovelace: 20n * ADA }, label: "keep" }),
          ],
          b: [
            spend.pubKey({ utxo: { step: "a", output: "keep" } }),
            pay({ lovelace: 500n * ADA }),
          ],
        },
        { payer: wallet },
      );
      const extra = consolidationsOf(plan);
      expect(extra.length).toBeGreaterThan(0);
      expect(plan.steps.map((step) => step.name)).toEqual([
        "a",
        ...extra.map((step) => step.name),
        "b",
      ]);
      const a = plan.step("a");
      const first = plan.step("consolidate-1");
      expect(first.standsOn).toEqual(["a"]);
      expect(a.change.length).toBeGreaterThan(0);
      expect(first.inputs.map(keyOf)).toContain(keyOf(a.change[0]!));
      expect(plan.step("b").standsOn).toEqual(
        expect.arrayContaining(["a", extra.at(-1)!.name]),
      );

      // The ledger keeps the order: the consolidation step is refused before a
      await plan.sign();
      await expect(emulator.submitTx(first.signedTx!)).rejects.toThrow();
      await plan.run();
      expect(plan.status).toBe("final");
      expect(paidTo(emulator, recipient)).toEqual([500n * ADA]);
    },
    LONG,
  );

  it(
    "stands on nothing when the change of the step before it, in a block, is not in the payer's read",
    async () => {
      const { emulator, builder, wallet, address } = await fragmented(
        coins(300, 2n * ADA),
        { maxTxSize: 4096, confirmations: 3 },
      );
      const plan = await builder.plan(
        {
          a: [
            output({ address, value: { lovelace: 20n * ADA }, label: "keep" }),
          ],
        },
        { payer: wallet },
      );
      await plan.run();
      const a = plan.step("a");
      expect(a.status).toBe("included");
      // The wallet spends the change of a outside the plan, and keeps the labelled output
      const keep = a.outputs.find((each) => each.label === "keep")!;
      const outside = await builder.build(
        [
          spend.pubKey({ utxo: a.change[0]! }),
          pay({ lovelace: 1n * ADA }, alice),
        ],
        { payer: wallet, canSelect: (utxo) => keyOf(utxo) !== keyOf(keep) },
      );
      await emulator.submitTx(await wallet.signTx(outside.tx));

      await plan.add({
        b: [
          spend.pubKey({ utxo: { step: "a", output: "keep" } }),
          pay({ lovelace: 500n * ADA }),
        ],
      });
      const extra = consolidationsOf(plan);
      expect(extra.length).toBeGreaterThan(0);
      expect(extra[0]!.standsOn).toEqual([]);
      expect(extra[0]!.inputs.map(keyOf)).not.toContain(keyOf(a.change[0]!));
      await plan.run();
      expect(plan.step("b").status).toBe("included");
      expect(paidTo(emulator, recipient)).toEqual([500n * ADA]);
    },
    LONG,
  );

  it(
    "takes no UTxO the step before it reads or puts up as collateral when the served step names all its change",
    async () => {
      const { emulator, builder, wallet, address } = await fragmented(
        coins(300, 2n * ADA),
        { maxTxSize: 4096, plutus: true },
      );
      const read = emulator.fund(address, { lovelace: 3n * ADA }).input;
      const putUp = emulator.fund(address, { lovelace: 5n * ADA }).input;
      const locked = { txHash: "7".repeat(64), outputIndex: 0 };
      emulator.addUtxos([
        {
          input: locked,
          output: {
            address: resolvePlutusScriptAddress(script, 0),
            amount: [{ unit: "lovelace", quantity: "20000000" }],
            plutusData: "d87980",
          },
        },
      ]);
      const reserved = [keyOf(read), keyOf(putUp)];
      // The served step's selection takes the two first: its failed build selected them
      const returned: string[][] = [];
      const theseFirst: SelectInputs = (need, candidates) => {
        const sorted = [
          ...candidates.filter((utxo) => reserved.includes(keyOf(utxo))),
          ...candidates.filter((utxo) => !reserved.includes(keyOf(utxo))),
        ];
        const taken: Utxo[] = [];
        for (const utxo of sorted) {
          if (sumOf(taken, "lovelace") >= (need.lovelace ?? 0n)) break;
          taken.push(utxo);
        }
        returned.push(taken.map(keyOf));
        return taken.map(({ txHash, outputIndex }) => ({
          txHash,
          outputIndex,
        }));
      };
      const plan = await builder.plan(
        {
          a: [
            spend.plutus({
              utxo: locked,
              script,
              redeemer: { data: mConStr0([]) },
            }),
            referenceInput({ utxo: read }),
            collateral({ utxo: putUp }),
            pay({ lovelace: 2n * ADA }, alice),
          ],
          b: {
            parts: [
              spend.pubKey({ utxo: { step: "a", change: true } }),
              pay({ lovelace: 500n * ADA }),
            ],
            coinSelection: theseFirst,
          },
        },
        { payer: wallet },
      );
      const a = plan.step("a");
      expect(a.referenceInputs.map(keyOf)).toEqual([keyOf(read)]);
      expect(a.collateral!.inputs.map(keyOf)).toEqual([keyOf(putUp)]);
      expect(returned[0]!.slice(0, 2)).toEqual(reserved);
      const extra = consolidationsOf(plan);
      expect(extra.length).toBeGreaterThan(0);
      // The change of a is all b's: the first consolidation step stands on nothing
      expect(extra[0]!.standsOn).toEqual([]);
      for (const step of extra)
        for (const each of reserved)
          expect(step.inputs.map(keyOf)).not.toContain(each);

      await plan.run();
      expect(plan.status).toBe("final");
      expect(paidTo(emulator, recipient)).toEqual([500n * ADA]);
      expect(paidTo(emulator, alice)).toEqual([2n * ADA]);
    },
    LONG,
  );
});
