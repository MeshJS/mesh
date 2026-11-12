import { DEFAULT_PROTOCOL_PARAMETERS, Protocol, UTxO } from "@meshsdk/core";

import {
  BuiltTx,
  output,
  outputOf,
  TxBuilder,
  TxBuildError,
  TxError,
} from "../../src/tx-builder";
import { baseAddress } from "../test-util";

const params: Protocol = { ...DEFAULT_PROTOCOL_PARAMETERS };
const wallet = baseAddress(1);
const recipient = baseAddress(2);
const ada = (n: number) => BigInt(n) * 1_000_000n;
const funds: UTxO = {
  input: { txHash: "c".repeat(64), outputIndex: 0 },
  output: {
    address: wallet,
    amount: [{ unit: "lovelace", quantity: String(ada(100)) }],
  },
};

const pay = (n: number, label?: string) =>
  output({
    address: recipient,
    value: { lovelace: ada(n) },
    ...(label !== undefined && { label }),
  });

const build = (parts: ReturnType<typeof pay>[]): Promise<BuiltTx> =>
  new TxBuilder({ network: "preprod", params }).build(parts, {
    payer: { changeAddress: wallet, utxos: [funds] },
  });

describe("outputOf", () => {
  it("returns the output made from the part with the label", async () => {
    const built = await build([pay(2, "first"), pay(3, "second")]);
    const second = outputOf(built, "second");
    expect(second).toBe(built.outputs.find((o) => o.label === "second"));
    expect(second.input).toEqual({ txHash: built.txHash, outputIndex: 1 });
    expect(second.output.amount[0]).toEqual({
      unit: "lovelace",
      quantity: String(ada(3)),
    });
  });

  it("returns the first in body order when several outputs carry the label", async () => {
    const built = await build([pay(2), pay(3, "twice"), pay(4, "twice")]);
    expect(outputOf(built, "twice").input.outputIndex).toBe(1);
  });

  it("throws UNKNOWN_LABEL listing the labels the transaction has", async () => {
    const built = await build([pay(2, "a"), pay(3), pay(4, "b"), pay(5, "a")]);
    let error: unknown;
    try {
      outputOf(built, "c");
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(TxBuildError);
    expect(error).not.toBeInstanceOf(RangeError);
    expect(TxError.is(error, "UNKNOWN_LABEL")).toBe(true);
    if (!TxError.is(error, "UNKNOWN_LABEL")) return;
    expect(error.details).toEqual({ label: "c", labels: ["a", "b"] });
    expect(error.retryable).toBe(false);
    expect(error.part).toBeUndefined();
    expect(error.message).toContain('"c"');
    expect(error.message).toContain('"a", "b"');

    const unlabelled = await build([pay(2)]);
    expect(() => outputOf(unlabelled, "a")).toThrow(
      "none of its outputs has a label",
    );
  });
});
