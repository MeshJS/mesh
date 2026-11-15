import type { TxEmulator } from "@meshsdk/tx-emulator";

import type { TxPlan } from "../../../src/tx-builder/plan/plan";
import { TxBuildError } from "../../../src/tx-builder";
import {
  advance,
  caught,
  FAST,
  forwarding,
  submitterOf,
  swallowing,
  walletOf,
} from "./plan-emulator-util";
import {
  ADA,
  alice,
  carol,
  dave,
  paidTo,
  payTo,
  refusal,
  stepSetup,
} from "./run-util";

// A step added after a step of the same payer in each status, against a read of the payer that
// is in time, that lags behind the chain (a fork made before the plan), and a snapshot that
// lists everything either chain showed the payer: no output is spent twice, and each recipient
// is paid once at most.

/** An out ref as text */
const ref = (u: { txHash: string; outputIndex: number }) =>
  `${u.txHash}#${u.outputIndex}`;

type Status = "built" | "signed" | "sent" | "rejected" | "included" | "final";
type Read = "live" | "lagging" | "snapshot";

/** Brings step `a` to the status; the bytes sent nowhere are returned, to land them later */
const bring = async (
  plan: TxPlan,
  status: Status,
  emulator: TxEmulator,
): Promise<string[]> => {
  switch (status) {
    case "built":
      return [];
    case "signed":
      await plan.sign();
      return [];
    case "sent": {
      const held = swallowing();
      await plan.run({ waitFor: "sent", submitter: held });
      return held.calls;
    }
    case "rejected": {
      const refusing = submitterOf(async () => {
        throw refusal();
      });
      await caught(plan.run({ waitFor: "sent", submitter: refusing }));
      return refusing.calls;
    }
    case "included":
      await caught(plan.run({ submitter: forwarding(emulator) }));
      return [];
    case "final":
      await caught(plan.run({ submitter: forwarding(emulator) }));
      for (let i = 0; i < 5; i++) advance(emulator, 1);
      await plan.refresh();
      return [];
  }
};

const STATUSES: Status[] = [
  "built",
  "signed",
  "sent",
  "rejected",
  "included",
  "final",
];
const READS: Read[] = ["live", "lagging", "snapshot"];

describe("an added step after a step of its payer in each status", () => {
  for (const status of STATUSES)
    for (const read of READS)
      it(`${status}, read ${read}`, async () => {
        const ctx = await stepSetup("scalus", {
          builder: { planDefaults: { ...FAST, confirmations: 3 } },
          funds: [1000n * ADA, 300n * ADA],
        });
        const { emulator, builder, wallet, address, provider } = ctx;
        const early = emulator.fork();
        const other = await walletOf(1);
        emulator.fund((await other.getChangeAddress())!, {
          lovelace: 50n * ADA,
        });
        // x, of a second payer and never signed, keeps a plan with a final step pending
        const plan = await builder.plan(
          {
            a: payTo(alice, 5n * ADA),
            x: { parts: payTo(dave, 2n * ADA), payer: other },
          },
          { payer: wallet },
        );
        const kept = await bring(plan, status, emulator);
        expect(plan.step("a").status).toBe(status);
        const lag = () => {
          provider.control.hooks.fetchAddressUTxOs = (_, ...args: unknown[]) =>
            (early.fetchAddressUTxOs as (...a: unknown[]) => Promise<unknown>)(
              ...args,
            );
        };
        if (read === "lagging") lag();
        const payer =
          read === "snapshot"
            ? {
                changeAddress: address,
                utxos: [
                  ...(await early.fetchAddressUTxOs(address)),
                  ...(await emulator.fetchAddressUTxOs(address)),
                ].filter(
                  (u, i, all) =>
                    all.findIndex((v) => ref(v.input) === ref(u.input)) === i,
                ),
              }
            : undefined;
        const step =
          payer === undefined
            ? payTo(carol, 900n * ADA)
            : { parts: payTo(carol, 900n * ADA), payer };
        if (read === "lagging" && status === "final") {
          // What a final step spent is never selected: a read that still lists it has too little
          const error = await caught(plan.add({ c: step }));
          expect(TxBuildError.is(error, "INSUFFICIENT_FUNDS")).toBe(true);
          expect(plan.steps).toHaveLength(2);
          return;
        }
        if (read === "lagging" && status === "included") {
          // The read does not list the change of a step in a block: refused, and taken once the
          // read catches up
          const error = await caught(plan.add({ c: step }));
          expect(TxBuildError.is(error, "INVALID_OPTION")).toBe(true);
          expect(error.message).toMatch(
            /the change of step "a" is not in the payer's read/,
          );
          expect(plan.steps).toHaveLength(2);
          delete provider.control.hooks.fetchAddressUTxOs;
          await plan.add({ c: step });
        } else {
          await plan.add({ c: step });
          delete provider.control.hooks.fetchAddressUTxOs;
        }
        const a = plan.step("a");
        const c = plan.step("c");
        const spent = new Set([...a.inputs, ...plan.step("x").inputs].map(ref));
        expect(c.inputs.filter((input) => spent.has(ref(input)))).toEqual([]);
        if (status !== "final") expect(c.standsOn).toContain("a");
        // Everything put on chain: one payment to each recipient at most
        for (const tx of kept)
          await emulator.submitTx(tx).catch(() => undefined);
        await plan
          .run({ signers: [wallet, other], submitter: forwarding(emulator) })
          .catch(() => undefined);
        expect(paidTo(emulator, alice).length).toBeLessThanOrEqual(1);
        expect(paidTo(emulator, carol).length).toBeLessThanOrEqual(1);
      }, 60_000);
});
