import { Address, Serialization } from "@meshsdk/core-cst";
import { TxEmulator } from "@meshsdk/tx-emulator";
import { MeshWallet } from "@meshsdk/wallet";

import { output, TxBuilder, TxError } from "../../../src/tx-builder";
import {
  arr,
  bytes,
  head,
  map,
  topItems,
  tx,
  txHashOf,
  uint,
} from "../cbor-util";

/*
 * A step given built is decoded by its reader, `fromCbor`, and once more by the reader of the
 * record it enters the plan through: the bound on the reference scripts it runs is counted in the
 * reader's decode, not in one of its own. The time a step at the bounds of a transaction takes in
 * `plan` is these decodes.
 */

describe("a plan of a step given built", () => {
  it("decodes the step's body twice: in its reader, which counts its reference scripts, and in the reader of its record", async () => {
    const emulator = await TxEmulator.create({
      validator: "scalus",
      network: "preprod",
      slot: 100_000_000,
    });
    const builder = new TxBuilder({
      network: "preprod",
      provider: emulator,
      evaluator: emulator,
    });
    const wallet = new MeshWallet({
      networkId: 0,
      key: { type: "mnemonic", words: Array(24).fill("solution") },
    });
    await wallet.init();
    const payTo = (await wallet.getChangeAddress())!;
    emulator.fund(payTo, { lovelace: 1_000_000_000n });
    const built = await builder.build(
      [output({ address: payTo, value: { lovelace: 2_000_000n } })],
      { payer: wallet },
    );
    const [body] = topItems(built.tx);
    const decode = jest.spyOn(Serialization.TransactionBody, "fromCbor");
    let decodes: number;
    try {
      const plan = await builder.plan({ given: built.tx }, { payer: wallet });
      expect(plan.steps.map((step) => step.kind)).toEqual(["prebuilt"]);
      decodes = decode.mock.calls.filter(([cbor]) => cbor === body).length;
    } finally {
      decode.mockRestore();
    }
    expect(decodes).toBe(2);
  }, 60_000);

  it("counts the reference scripts of the outputs of the plan's own transactions the step reads: refused at once past the bound", async () => {
    const emulator = await TxEmulator.create({
      validator: "scalus",
      network: "preprod",
      slot: 100_000_000,
    });
    const builder = new TxBuilder({
      network: "preprod",
      provider: emulator,
      evaluator: emulator,
    });
    const wallet = new MeshWallet({
      networkId: 0,
      key: { type: "mnemonic", words: Array(24).fill("solution") },
    });
    await wallet.init();
    const payTo = (await wallet.getChangeAddress())!;
    const payHex = Address.fromBech32(payTo).toBytes().toString();
    const funded = emulator.fund(payTo, { lovelace: 1_000_000_000n });
    // Transactions of after, each paying one output that holds a native script of 15 365 bytes,
    // all of 480 keys: 14 of them hold 215 110 bytes, past the 204 800 a node takes
    const key = (i: number) => `8200581c${i.toString(16).padStart(56, "0")}`;
    const bodies = Array.from({ length: 14 }, (_, i) => {
      const script = `8201${head(4, 480)}${Array.from({ length: 480 }, (_, k) => key(i * 1_000 + k)).join("")}`;
      return map(
        [
          uint(0),
          arr(arr(bytes((i + 1).toString(16).padStart(64, "0")), uint(0))),
        ],
        [
          uint(1),
          arr(
            map(
              [uint(0), bytes(payHex)],
              [uint(1), uint(60_000_000)],
              [uint(3), `d818${bytes(arr(uint(0), script))}`],
            ),
          ),
        ],
        [uint(2), uint(1_000_000)],
      );
    });
    // Read from their own bytes: of the object only the number of its outputs is taken
    const after = bodies.map(
      (body) => ({ tx: tx(body), outputs: [{}] }) as never,
    );
    const step = tx(
      map(
        [
          uint(0),
          arr(arr(bytes(funded.input.txHash), uint(funded.input.outputIndex))),
        ],
        [
          uint(1),
          arr(map([uint(0), bytes(payHex)], [uint(1), uint(900_000_000)])),
        ],
        [uint(2), uint(1_000_000)],
        [
          uint(18),
          arr(...bodies.map((body) => arr(bytes(txHashOf(body)), uint(0)))),
        ],
      ),
    );
    const started = performance.now();
    let error: unknown;
    try {
      await builder.plan({ given: step }, { payer: wallet, after });
    } catch (e) {
      error = e;
    }
    // About eight times its time in the whole suite on a quiet machine (400 ms): reading the 14
    // outputs before counting them takes seconds
    expect(performance.now() - started).toBeLessThan(3_000);
    expect(TxError.is(error, "INVALID_OPTION")).toBe(true);
    expect((error as Error).message).toBe(
      'step "given": invalid tx: its spent and reference inputs hold more than the 204800 bytes of reference scripts a node takes in one transaction (ConwayTxRefScriptsSizeTooBig)',
    );
  }, 60_000);
});
