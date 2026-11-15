import { resolvePlutusScriptAddress } from "@meshsdk/core-cst";

import type { Utxo } from "../../../src/tx-builder";
import { TxBuildError } from "../../../src/tx-builder";
import { alwaysSucceedCbor } from "../../test-util";
import {
  coins,
  consolidationsOf,
  fragmented,
  keyOf,
  pay,
} from "./consolidate-util";
import { caught, recipient } from "./plan-emulator-util";
import { ADA, paidTo } from "./run-util";

// A canSelect that lets through only the UTxOs the wallet held: the step a consolidation step
// serves, and the next consolidation step made for it, spend that step's change without asking;
// nothing else is spent that canSelect refuses. A consolidation step whose change the step
// cannot stand on is told as the step's TX_TOO_LARGE.

const LONG = 300_000;
const script = { code: alwaysSucceedCbor, version: "V3" as const };

describe("consolidation with a canSelect of the wallet's own", () => {
  it(
    "makes and runs the plan, spending nothing canSelect refuses but the change of a consolidation step, by the step right after it",
    async () => {
      const { emulator, provider, builder, wallet, address } = await fragmented(
        coins(300, 2n * ADA),
        { maxTxSize: 4096 },
      );
      const known = new Set(
        (await provider.fetchAddressUTxOs(address)).map((u) => keyOf(u.input)),
      );
      const canSelect = (utxo: Utxo) => known.has(keyOf(utxo));
      const plan = await builder.plan(pay({ lovelace: 500n * ADA }), {
        payer: wallet,
        canSelect,
      });
      const extra = consolidationsOf(plan);
      expect(extra.length).toBeGreaterThanOrEqual(2);
      for (const [i, step] of plan.steps.entries()) {
        const before = plan.steps[i - 1];
        for (const input of step.inputs) {
          if (known.has(keyOf(input))) continue;
          // Only the change of the consolidation step right before it
          expect(before?.kind).toBe("consolidation");
          expect(keyOf(input)).toBe(keyOf(before!.change[0]!));
        }
      }
      await plan.run();
      expect(plan.status).toBe("final");
      expect(paidTo(emulator, recipient)).toEqual([500n * ADA]);
    },
    LONG,
  );

  it(
    "tells a consolidation step whose change the step cannot stand on as the step's TX_TOO_LARGE, the refusal as its cause",
    async () => {
      const { builder, wallet } = await fragmented(coins(300, 2n * ADA), {
        maxTxSize: 4096,
      });
      // Change to a script address: no consolidation step leaves change the step can spend
      const snapshot = await builder.readPayer(wallet);
      const payer = {
        ...snapshot,
        changeAddress: resolvePlutusScriptAddress(script, 0),
      };
      const error = await caught(
        builder.plan(pay({ lovelace: 500n * ADA }), { payer }),
      );
      expect(TxBuildError.is(error, "TX_TOO_LARGE")).toBe(true);
      expect(error.details.cause).toBe("selection");
      expect(error.message.startsWith('step "main": ')).toBe(true);
      expect(error.message).toMatch(/consolidate-1/);
      expect(error.message).not.toMatch(/[Ll]ink step/);
      expect(TxBuildError.is(error.cause, "INVALID_OPTION")).toBe(true);
      expect(error.cause.details.option).toBe("steps");
      expect(error.cause.message).toMatch(/leaves no change/);
    },
    LONG,
  );
});
