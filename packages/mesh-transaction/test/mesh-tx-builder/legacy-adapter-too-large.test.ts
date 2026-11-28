import { DEFAULT_PROTOCOL_PARAMETERS, UTxO } from "@meshsdk/common";

import { MeshTxBuilder } from "../../src";
import { baseAddress } from "../test-util";

const wallet = baseAddress(1);
const recipient = baseAddress(2);
const maxTxSize = DEFAULT_PROTOCOL_PARAMETERS.maxTxSize;

let nextHash = 0x900;
const utxos = (count: number, lovelace: number): UTxO[] =>
  Array.from({ length: count }, () => ({
    input: {
      txHash: (++nextHash).toString(16).padStart(64, "e"),
      outputIndex: 0,
    },
    output: {
      address: wallet,
      amount: [{ unit: "lovelace", quantity: String(lovelace) }],
    },
  }));

const lovelace = (n: number) => [{ unit: "lovelace", quantity: String(n) }];

const rejection = async (run: () => Promise<unknown>) =>
  run().then(
    () => {
      throw new Error("expected an error");
    },
    (e: unknown) => e as Error & { code?: string; details?: unknown },
  );

// The code, the message and the size are those of the builder's own error; the cause is one
// detail more, which a consumer that does not read it never sees
describe("MeshTxBuilder: a transaction larger than maxTxSize", () => {
  it("is TX_TOO_LARGE with the builder's message and size, for outputs that do not fit", async () => {
    const builder = new MeshTxBuilder({ params: DEFAULT_PROTOCOL_PARAMETERS });
    for (let i = 0; i < 300; i++) builder.txOut(recipient, lovelace(2_000_000));
    const error = await rejection(() =>
      builder
        .changeAddress(wallet)
        .selectUtxosFrom(utxos(1, 10_000_000_000))
        .complete(),
    );
    expect(error.code).toBe("TX_TOO_LARGE");
    const { size } = error.details as { size: number };
    expect(error.message).toBe(
      `the transaction takes ${size} bytes, more than the ${maxTxSize} allowed`,
    );
    expect(error.details).toEqual({ size: 19727, maxTxSize, cause: "parts" });
  });

  it("is TX_TOO_LARGE with the builder's message and size, for a fragmented wallet", async () => {
    const error = await rejection(() =>
      new MeshTxBuilder({ params: DEFAULT_PROTOCOL_PARAMETERS })
        .txOut(recipient, lovelace(1_000_000_000))
        .changeAddress(wallet)
        .selectUtxosFrom(utxos(600, 2_000_000))
        .complete(),
    );
    expect(error.code).toBe("TX_TOO_LARGE");
    const { size } = error.details as { size: number };
    expect(error.message).toBe(
      `the transaction takes ${size} bytes, more than the ${maxTxSize} allowed`,
    );
    expect(error.details).toEqual({
      size: 18187,
      maxTxSize,
      cause: "selection",
    });
  });
});
