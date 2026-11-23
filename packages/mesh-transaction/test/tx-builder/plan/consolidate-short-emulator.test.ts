import type { BuildEvent, Utxo } from "../../../src/tx-builder";
import { output, TxBuildError } from "../../../src/tx-builder";
import { outputMinCoin } from "../../../src/tx-builder/fee";
import { toValuePrototype, valueOf } from "../../../src/tx-builder/value";
import {
  builderOf,
  caught,
  emulatorOf,
  recipient,
  VALIDATORS,
  walletOf,
  wrap,
} from "./plan-emulator-util";
import { ADA } from "./run-util";
import { watchStore } from "./store-util";

// A consolidation step that cannot pay for its own outputs and fee: the step it serves is what
// the application asked for, so the plan tells the failure as that step's TX_TOO_LARGE, with
// the consolidation step's error as its cause, and records nothing.

const LONG = 120_000;

const keyOf = (ref: { txHash: string; outputIndex: number }) =>
  `${ref.txHash}#${ref.outputIndex}`;

describe.each(VALIDATORS)(
  "a consolidation step that lacks lovelace (%s)",
  (v) => {
    it(
      "is the served step's TX_TOO_LARGE with the consolidation step's error as its cause",
      async () => {
        const emulator = await emulatorOf(v, 100_000_000);
        const params = await emulator.fetchProtocolParameters();
        const store = watchStore();
        const builder = builderOf(wrap(emulator), {
          params: { ...params, maxTxSize: 4096 },
          store,
        });
        const wallet = await walletOf();
        const address = (await wallet.getChangeAddress())!;
        // UTxOs of one token each, holding the least lovelace an output of it takes
        const tokens = Array.from({ length: 150 }, (_, i) => {
          const value = {
            lovelace: 0n,
            [`${"c7".repeat(28)}${i.toString(16).padStart(4, "0")}`]: 1n,
          };
          value.lovelace = outputMinCoin(
            { address, amount: toValuePrototype(valueOf(value)) },
            params.coinsPerUtxoSize,
          );
          const { input } = emulator.fund(address, value);
          return keyOf(input);
        });
        emulator.fund(address, { lovelace: 50n * ADA });

        // Once the step is too large, only two of those UTxOs may be selected or consolidated:
        // parking both tokens and the change take more lovelace than the two hold
        let tooLarge = false;
        const allowed = new Set(tokens.slice(0, 2));
        const canSelect = (utxo: Utxo) => !tooLarge || allowed.has(keyOf(utxo));
        const trace = (event: BuildEvent) => {
          if (event.type === "round" && event.size > 4096) tooLarge = true;
        };
        const error = await caught(
          builder.plan(
            output({ address: recipient, value: { lovelace: 200n * ADA } }),
            { payer: wallet, id: "short", canSelect, trace },
          ),
        );
        expect(tooLarge).toBe(true);
        expect(TxBuildError.is(error, "TX_TOO_LARGE")).toBe(true);
        expect(error.details.cause).toBe("selection");
        expect(error.message.startsWith('step "main": ')).toBe(true);
        expect(error.message).toMatch(/consolidate-1/);
        expect(TxBuildError.is(error.cause, "INSUFFICIENT_FUNDS")).toBe(true);
        expect(store.saves()).toEqual([]);
      },
      LONG,
    );
  },
);
