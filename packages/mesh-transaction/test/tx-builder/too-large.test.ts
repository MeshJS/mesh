import {
  DEFAULT_PROTOCOL_PARAMETERS,
  Protocol,
  TransactionPrototype,
} from "@meshsdk/core";
import { transactionPrototypeToHex } from "@meshsdk/core-cst";

import {
  BuildEvent,
  output,
  spend,
  TxBuilder,
  TxBuildError,
  Utxo,
} from "../../src/tx-builder";
import { baseAddress } from "../test-util";

const network = "preprod";
const params: Protocol = { ...DEFAULT_PROTOCOL_PARAMETERS };
const wallet = baseAddress(1);
const recipient = baseAddress(2);

const ada = (n: number) => BigInt(n) * 1_000_000n;
let nextHash = 0x700;
const utxo = (lovelace: bigint): Utxo => ({
  txHash: (++nextHash).toString(16).padStart(64, "d"),
  outputIndex: 0,
  address: wallet,
  value: { lovelace },
});
const utxos = (count: number, lovelace: bigint) =>
  Array.from({ length: count }, () => utxo(lovelace));

const pay = (lovelace: bigint) =>
  output({ address: recipient, value: { lovelace } });

/** A builder whose serializer counts the transactions it serializes */
const counting = () => {
  const counted = { calls: 0 };
  const builder = new TxBuilder({
    network,
    params,
    serializer: {
      serializeTxPrototype: (prototype: TransactionPrototype) => {
        counted.calls++;
        return transactionPrototypeToHex(prototype);
      },
    } as never,
  });
  return { builder, counted };
};

const tooLarge = async (run: () => Promise<unknown>) => {
  const error = await run().then(
    () => {
      throw new Error("expected TX_TOO_LARGE");
    },
    (e: unknown) => e,
  );
  expect(TxBuildError.is(error, "TX_TOO_LARGE")).toBe(true);
  return error as TxBuildError<"TX_TOO_LARGE">;
};

describe("TxBuilder: why a transaction is too large", () => {
  it("is cause parts when the outputs alone do not fit a transaction", async () => {
    const builder = new TxBuilder({ network, params });
    const error = await tooLarge(() =>
      builder.build(
        Array.from({ length: 300 }, () => pay(ada(2))),
        { payer: { changeAddress: wallet, utxos: [utxo(ada(10_000))] } },
      ),
    );
    expect(error.details).toEqual({
      size: expect.any(Number),
      maxTxSize: params.maxTxSize,
      cause: "parts",
    });
    expect(error.details.size).toBeGreaterThan(params.maxTxSize);
    expect(error.message).toBe(
      `the transaction takes ${error.details.size} bytes, more than the ${params.maxTxSize} allowed`,
    );
  });

  it("is cause selection for a fragmented wallet: the payment fits with one input, the many small ones selected do not", async () => {
    const builder = new TxBuilder({ network, params });
    const error = await tooLarge(() =>
      builder.build(pay(ada(1_000)), {
        payer: { changeAddress: wallet, utxos: utxos(600, ada(2)) },
      }),
    );
    expect(error.details).toEqual({
      size: expect.any(Number),
      maxTxSize: params.maxTxSize,
      cause: "selection",
    });
    expect(error.details.size).toBeGreaterThan(params.maxTxSize);
  });

  it("is not cause selection when one selected input with its tokens would not fit either", async () => {
    const builder = new TxBuilder({ network, params });
    // The one input selection takes carries more tokens than a transaction can hold
    const tokens: Record<string, bigint> = {};
    for (let i = 0; i < 400; i++)
      tokens[`${i.toString(16).padStart(56, "c")}${"ab".repeat(16)}`] = 1n;
    const laden: Utxo = {
      ...utxo(ada(1_100)),
      value: { lovelace: ada(1_100), ...tokens },
    };
    const error = await tooLarge(() =>
      builder.build(pay(ada(1_000)), {
        payer: { changeAddress: wallet, utxos: [laden] },
      }),
    );
    expect(error.details.cause).toBe("parts");
  });

  it("is cause parts when the parts spend every input themselves and selection adds none", async () => {
    const builder = new TxBuilder({ network, params });
    const inputs = utxos(600, ada(2));
    const error = await tooLarge(() =>
      builder.build(
        [...inputs.map((u) => spend.pubKey({ utxo: u })), pay(ada(1_000))],
        { payer: { changeAddress: wallet, utxos: [] } },
      ),
    );
    expect(error.details.cause).toBe("parts");
  });

  it("serializes one transaction more than its rounds when it fails, and none on a build that succeeds", async () => {
    const rounds = (events: BuildEvent[]) =>
      events.filter((e) => e.type === "round").length;

    const ok = counting();
    const okEvents: BuildEvent[] = [];
    await ok.builder.build(pay(ada(5)), {
      payer: { changeAddress: wallet, utxos: utxos(3, ada(10)) },
      trace: (event) => okEvents.push(event),
    });
    // The rounds, and the transaction that is returned
    expect(ok.counted.calls).toBe(rounds(okEvents) + 1);

    const failed = counting();
    const failedEvents: BuildEvent[] = [];
    await tooLarge(() =>
      failed.builder.build(pay(ada(1_000)), {
        payer: { changeAddress: wallet, utxos: utxos(600, ada(2)) },
        trace: (event) => failedEvents.push(event),
      }),
    );
    // The rounds, and the one trial that tells the cause
    expect(failed.counted.calls).toBe(rounds(failedEvents) + 1);
  });

  it("is the same, its maxTxSize the number 32 768, for params.maxTxSize given as 32 768, a string of digits or a bigint: of cause parts and of cause selection", async () => {
    const said = (error: TxBuildError<"TX_TOO_LARGE">) => ({
      message: error.message,
      details: error.details,
    });
    const outputs = Array.from({ length: 1_000 }, () => pay(ada(2)));
    const funds = utxo(ada(10_000));
    const small = utxos(1_200, ada(2));
    for (const [run, cause] of [
      [
        (builder: TxBuilder) =>
          builder.build(outputs, {
            payer: { changeAddress: wallet, utxos: [funds] },
          }),
        "parts",
      ],
      [
        (builder: TxBuilder) =>
          builder.build(pay(ada(2_000)), {
            payer: { changeAddress: wallet, utxos: small },
          }),
        "selection",
      ],
    ] as const) {
      const errors = [];
      for (const maxTxSize of [32_768, "32768", 32_768n])
        errors.push(
          said(
            await tooLarge(() =>
              run(
                new TxBuilder({
                  network,
                  params: { ...params, maxTxSize } as unknown as Protocol,
                }),
              ),
            ),
          ),
        );
      const [first] = errors;
      expect(first!.details).toEqual({
        size: expect.any(Number),
        maxTxSize: 32_768,
        cause,
      });
      expect(first!.details.size).toBeGreaterThan(32_768);
      expect(first!.message).toBe(
        `the transaction takes ${first!.details.size} bytes, more than the 32768 allowed`,
      );
      expect(errors).toEqual([first, first, first]);
    }
  });
});
