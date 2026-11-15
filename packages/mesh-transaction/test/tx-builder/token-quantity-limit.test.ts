import type { Protocol } from "@meshsdk/common";
import { DEFAULT_PROTOCOL_PARAMETERS } from "@meshsdk/core";
import { Transaction, TxCBOR } from "@meshsdk/core-cst";

import type { Utxo } from "../../src/tx-builder";
import { output, TxBuilder, TxBuildError } from "../../src/tx-builder";
import { bundleTokens } from "../../src/tx-builder/balance";
import { baseAddress } from "../test-util";
import {
  builderOf,
  caught,
  emulatorOf,
  recipient,
  walletOf,
  wrap,
} from "./plan/plan-emulator-util";
import { watchStore } from "./plan/store-util";

// A token whose quantity over the inputs of a transaction is more than one output can hold,
// 2^64 - 1: a typed error that names the token and says what to do, in a build and in a plan;
// the largest quantity an output holds still builds. The emulator here only reads: it refuses
// quantities from 2^63 up, which the ledger takes.

const ADA = 1_000_000n;
const MAX_QUANTITY = 2n ** 64n - 1n;
const HALF = 2n ** 63n - 1n;
const huge = `${"e5".repeat(28)}beef`;

const params: Protocol = { ...DEFAULT_PROTOCOL_PARAMETERS };
const wallet = baseAddress(1);
let next = 0x700;
const utxo = (value: Utxo["value"]): Utxo => ({
  txHash: (++next).toString(16).padStart(64, "d"),
  outputIndex: 0,
  address: wallet,
  value,
});

const pay = (lovelace: bigint) =>
  output({ address: recipient, value: { lovelace } });

/** The error says which token, that one output cannot hold it, and what the application can do */
const expectTooMuch = (error: unknown) => {
  expect(TxBuildError.is(error, "VALUE_TOO_LARGE")).toBe(true);
  const { message, details } = error as TxBuildError<"VALUE_TOO_LARGE">;
  expect(message).toContain(huge);
  expect(message).toContain("more than one output can hold");
  expect(message).toContain("canSelect");
  expect(details.maxValSize).toBe(params.maxValSize);
  expect(typeof details.size).toBe("number");
};

describe("a token quantity no output can hold", () => {
  const builder = new TxBuilder({ network: "preprod", params });

  it("is VALUE_TOO_LARGE in a build whose change would hold it", async () => {
    const utxos = [1, 2, 3].map(() =>
      utxo({ lovelace: 3n * ADA, [huge]: HALF }),
    );
    const error = await caught(
      builder.build(pay(7n * ADA), {
        payer: { changeAddress: wallet, utxos },
      }),
    );
    expectTooMuch(error);
    expect(error.message).toContain(`${3n * HALF}`);

    // Spending fewer of those UTxOs builds
    const kept = new Set(utxos.slice(0, 2).map((u) => u.txHash));
    const built = await builder.build(pay(3n * ADA), {
      payer: { changeAddress: wallet, utxos },
      canSelect: (each) => kept.has(each.txHash),
    });
    expect(built.change.map((each) => each.value[huge])).toContain(2n * HALF);
  });

  it("builds a change of exactly 2^64 - 1 of a token", async () => {
    const utxos = [
      utxo({ lovelace: 3n * ADA, [huge]: 2n ** 63n }),
      utxo({ lovelace: 3n * ADA, [huge]: HALF }),
    ];
    const built = await builder.build(pay(4n * ADA), {
      payer: { changeAddress: wallet, utxos },
    });
    expect(built.inputs).toHaveLength(2);
    expect(built.change.map((each) => each.value[huge])).toEqual([
      MAX_QUANTITY,
    ]);
    const body = Transaction.fromCbor(TxCBOR(built.tx)).body();
    const written = body
      .outputs()
      .flatMap((each) =>
        Array.from(each.amount().multiasset()?.values() ?? []),
      );
    expect(written).toEqual([MAX_QUANTITY]);
  });

  it("bundles 2^64 - 1 of a token, and refuses one more", () => {
    expect(
      bundleTokens(new Map([[huge, MAX_QUANTITY]]), params.maxValSize),
    ).toEqual([new Map([[huge, MAX_QUANTITY]])]);
    const error = (() => {
      try {
        bundleTokens(
          new Map([
            [`${"e5".repeat(28)}aa`, 1n],
            [huge, MAX_QUANTITY + 1n],
          ]),
          params.maxValSize,
        );
      } catch (thrown) {
        return thrown;
      }
      throw new Error("expected the call to throw");
    })();
    expectTooMuch(error);
  });
});

describe("a token quantity no output can hold, in a plan", () => {
  /** An emulator holding the wallet's UTxOs: three of a token at 2^63 - 1 and many of lovelace */
  const fragmented = async (store: ReturnType<typeof watchStore>) => {
    const emulator = await emulatorOf(100_000_000);
    const provider = wrap(emulator);
    const read = await emulator.fetchProtocolParameters();
    const builder = builderOf(provider, {
      params: { ...read, maxTxSize: 4096 },
      store,
    });
    const payer = await walletOf();
    const address = (await payer.getChangeAddress())!;
    for (let i = 0; i < 3; i++)
      emulator.fund(address, { lovelace: 1_500_000n, [huge]: HALF });
    for (let i = 0; i < 200; i++)
      emulator.fund(address, { lovelace: 2n * ADA });
    return { builder, payer };
  };

  it("is a typed error with the step's name first, and nothing is recorded", async () => {
    const store = watchStore();
    const { builder, payer } = await fragmented(store);
    const payment = pay(402n * ADA);

    const alone = await caught(builder.build(payment, { payer }));
    expectTooMuch(alone);

    const error = await caught(
      builder.plan({ main: payment }, { payer, id: "huge" }),
    );
    // The step's own build: its change would hold it
    expectTooMuch(error);
    expect(error.message.startsWith('step "main": ')).toBe(true);
    expect(store.saves()).toEqual([]);
    expect(await store.load("huge")).toBeUndefined();
  }, 120_000);

  it("is the served step's error when a consolidation step would hold it, and nothing is recorded", async () => {
    const store = watchStore();
    const { builder, payer } = await fragmented(store);
    // The step pays all of the token but 2^63 - 2: its own change holds what fits, and a
    // consolidation step that keeps the token for it would take all three UTxOs of it
    const payment = output({
      address: recipient,
      value: { lovelace: 402n * ADA, [huge]: MAX_QUANTITY },
    });
    const error = await caught(
      builder.plan({ main: payment }, { payer, id: "kept" }),
    );
    expect(TxBuildError.is(error, "TX_TOO_LARGE")).toBe(true);
    expect(error.details.cause).toBe("selection");
    expect(error.message.startsWith('step "main": ')).toBe(true);
    expect(error.message).toMatch(/consolidate-1/);
    expectTooMuch(error.cause);
    expect(store.saves()).toEqual([]);
    expect(await store.load("kept")).toBeUndefined();
  }, 120_000);
});
