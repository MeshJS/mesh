import { Crypto } from "@meshsdk/core-cst";
import { TxEmulator } from "@meshsdk/tx-emulator";

import { output, referenceInput, TxBuilder } from "../../src/tx-builder";
import { head } from "./cbor-util";
import { keysSigner, testKey } from "./hash-signer-util";

// The data of a UTxO is read without being decoded: a datum that nests deep, on the chain or in
// a payer's UTxOs, costs a build no more time than its bytes, and such a UTxO is spent as any
// other key-locked one.

/** A list nested `depth` deep around a list of `width` zeros, as a datum */
const deepDatum = (depth: number, width = 0) =>
  width > 0
    ? "81".repeat(depth) + head(4, width) + "00".repeat(width)
    : "81".repeat(depth) + "00";

/** The datums of the scenarios: 15 KB nested 120 deep, and lists nested 2 000 and 4 000 deep */
const DATUMS: [string, string][] = [
  ["15 000 zeros nested 120 deep", deepDatum(120, 15_000)],
  ["a list nested 2 000 deep", deepDatum(2_000)],
  ["a list nested 4 000 deep", deepDatum(4_000)],
];

/**
 * The time a build that reads such a datum is given. It takes milliseconds, and decoding such a
 * datum took 26 s; the bound is wide because a run of every suite at once can stall one build for
 * seconds
 */
const BOUND_MS = 10_000;

const timed = async <T>(run: () => Promise<T>) => {
  const start = performance.now();
  const result = await run();
  return { result, ms: performance.now() - start };
};

describe.each(["scalus", "cquisitor"] as const)(
  "the data of a UTxO, read without being decoded (%s)",
  (validator) => {
    const setup = async () => {
      await Crypto.ready();
      const emulator = await TxEmulator.create({
        validator,
        network: "preprod",
        slot: 100_000_000,
      });
      const builder = new TxBuilder({ network: "preprod", provider: emulator });
      return { emulator, builder };
    };

    it.each(DATUMS)(
      "builds for a payer that holds a key-locked UTxO whose inline datum is %s, and spends it",
      async (_, datum) => {
        const { emulator, builder } = await setup();
        const payer = testKey();
        const to = testKey();
        emulator.addUtxos([
          {
            input: { txHash: "d1".repeat(32), outputIndex: 0 },
            output: {
              address: payer.address,
              amount: [{ unit: "lovelace", quantity: "40000000" }],
              plutusData: datum,
            },
          },
        ]);
        // Its only UTxO: selection takes it
        const only = await timed(() =>
          builder.build(
            [output({ address: to.address, value: { lovelace: 5_000_000n } })],
            { payer: payer.address },
          ),
        );
        expect(only.ms).toBeLessThan(BOUND_MS);
        const built = only.result;
        expect(built.inputs.map((u) => u.txHash)).toEqual(["d1".repeat(32)]);
        expect(built.inputs[0]!.datum).toEqual({
          type: "inline",
          data: { type: "CBOR", content: datum },
        });
        await built.sign({ signers: keysSigner("object", payer).signer });
        await built.submit();
        expect(emulator.utxos({ address: to.address })).toHaveLength(1);

        // Beside a plain UTxO, it does not slow a build that does not need it
        emulator.addUtxos([
          {
            input: { txHash: "d2".repeat(32), outputIndex: 0 },
            output: {
              address: payer.address,
              amount: [{ unit: "lovelace", quantity: "40000000" }],
              plutusData: datum,
            },
          },
        ]);
        emulator.fund(payer.address, { lovelace: 100_000_000n });
        const beside = await timed(() =>
          builder.build(
            [output({ address: to.address, value: { lovelace: 5_000_000n } })],
            { payer: payer.address },
          ),
        );
        expect(beside.ms).toBeLessThan(BOUND_MS);
      },
      60_000,
    );

    it("reads an output on the chain whose inline datum nests 120 deep around 15 KB, as a reference input, in a build", async () => {
      const { emulator, builder } = await setup();
      const maker = testKey();
      const user = testKey();
      emulator.fund(user.address, { lovelace: 50_000_000n });
      // The outputs of one transaction, each with such a datum; one of them is read
      const made = "d3".repeat(32);
      const datum = deepDatum(120, 15_000);
      emulator.addUtxos(
        [0, 1, 2].map((outputIndex) => ({
          input: { txHash: made, outputIndex },
          output: {
            address: maker.address,
            amount: [{ unit: "lovelace", quantity: "80000000" }],
            plutusData: datum,
          },
        })),
      );
      const { result: built, ms } = await timed(() =>
        builder.build(
          [
            referenceInput({ utxo: { txHash: made, outputIndex: 0 } }),
            output({ address: maker.address, value: { lovelace: 5_000_000n } }),
          ],
          { payer: user.address },
        ),
      );
      expect(ms).toBeLessThan(BOUND_MS);
      expect(built.referenceInputs).toHaveLength(1);
      expect(built.referenceInputs[0]!.datum).toEqual({
        type: "inline",
        data: { type: "CBOR", content: datum },
      });
      await built.sign({ signers: keysSigner("object", user).signer });
      await built.submit();
    }, 60_000);
  },
);
