import { DEFAULT_PROTOCOL_PARAMETERS, Protocol, UTxO } from "@meshsdk/common";
import {
  Address,
  Crypto,
  HexBlob,
  transactionPrototypeFromHex,
} from "@meshsdk/core-cst";
import { TxEmulator } from "@meshsdk/tx-emulator";
import { MeshWallet } from "@meshsdk/wallet";

import {
  mint,
  output,
  referenceInput,
  requiredSigners,
  TxBuilder,
  TxBuildError,
  TxError,
} from "../../src/tx-builder";
import { arr, bytes, head, map, uint } from "./cbor-util";

/*
 * The reference scripts the UTxOs of a transaction's spent and reference inputs hold are bounded
 * as the Conway ledger bounds them: 204 800 bytes in all (`maxRefScriptSizePerTx`). Past it a
 * transaction is refused before any of its UTxOs is read whole, wherever its signers are read from
 * the UTxOs given with it, and no build makes one.
 */

const params: Protocol = { ...DEFAULT_PROTOCOL_PARAMETERS };
const KEY_HASH = "77".repeat(28);
const addressHex = `60${KEY_HASH}`;
const address = Address.fromBytes(HexBlob(addressHex)).toBech32();
const txOf = (i: number) => (i + 1).toString(16).padStart(64, "0");
const key = (i: number) => `8200581c${i.toString(16).padStart(56, "0")}`;
const deepAround = (levels: number, leaf: string) =>
  "820181".repeat(levels) + leaf;
/**
 * A native script of 15 643 bytes, 504 levels deep, whose keys are read: all of 20, each nested
 * 250 deep
 */
const heavy = (i: number) =>
  `820194${deepAround(250, key(i * 16 + 1))}${deepAround(250, key(1)).repeat(19)}`;
const policyOf = (item: string) =>
  Crypto.blake2b.hash(HexBlob(`00${item}`), 28).toString();
const mesh = (i: number, scriptRef?: string, lovelace = "50000000"): UTxO => ({
  input: { txHash: txOf(i), outputIndex: 0 },
  output: {
    address,
    amount: [{ unit: "lovelace", quantity: lovelace }],
    ...(scriptRef !== undefined && { scriptRef }),
  },
});
/**
 * A transaction that spends `from` and mints one token under each native script, each read from
 * a reference input, `100 + i`
 */
const runs = (
  items: readonly string[],
  from = { txHash: txOf(0), outputIndex: 0 },
  to = addressHex,
) =>
  arr(
    map(
      [uint(0), arr(arr(bytes(from.txHash), uint(from.outputIndex)))],
      [uint(1), arr(map([uint(0), bytes(to)], [uint(1), "1a001e8480"]))],
      [uint(2), "1a000f4240"],
      [
        uint(9),
        head(5, items.length) +
          items.map((it) => `${bytes(policyOf(it))}a14001`).join(""),
      ],
      [
        uint(18),
        arr(...items.map((_, i) => arr(bytes(txOf(100 + i)), uint(0)))),
      ],
    ),
    map(),
    "f5",
    "f6",
  );
const offline = () => new TxBuilder({ network: "preprod", params });
const said = "a node takes in one transaction (ConwayTxRefScriptsSizeTooBig)";
const timed = async (run: () => unknown) => {
  const started = performance.now();
  let error: unknown;
  try {
    await run();
  } catch (e) {
    error = e;
  }
  return { error: error as TxError, ms: performance.now() - started };
};

describe("the reference scripts of a transaction, bounded as the ledger bounds them", () => {
  // 235 scripts of 15 643 bytes: 3 676 105 bytes, eighteen times the bound
  const items = Array.from({ length: 235 }, (_, i) => heavy(i));
  const tx = runs(items);
  const known = [mesh(0), ...items.map((it, i) => mesh(100 + i, `8200${it}`))];

  it("refuses at once a transaction past it where its signers are read from the UTxOs given: requiredSigners, fromCbor with knownUtxos or through the provider, finalize", async () => {
    const refused = (error: TxError) => {
      expect(TxError.is(error, "INVALID_OPTION")).toBe(true);
      expect(error.message).toMatch(
        /^invalid tx: its spent and reference inputs hold \d+ bytes of reference scripts, more than the 204800 /,
      );
      expect(error.message).toContain(said);
    };
    const signers = await timed(() => requiredSigners(tx, known));
    expect(signers.ms).toBeLessThan(500);
    refused(signers.error);
    const given = await timed(() =>
      offline().fromCbor(tx, { knownUtxos: known }),
    );
    expect(given.ms).toBeLessThan(500);
    refused(given.error);
    // Through the provider, its answers counted before they are read
    const byHash = new Map(known.map((u) => [u.input.txHash, u]));
    const provider = {
      fetchUTxOs: async (hash: string) =>
        byHash.has(hash) ? [byHash.get(hash)!] : [],
      fetchProtocolParameters: async () => params,
    };
    const read = await timed(() =>
      new TxBuilder({
        network: "preprod",
        params,
        provider: provider as never,
      }).fromCbor(tx, { knownUtxos: [mesh(0)] }),
    );
    expect(read.ms).toBeLessThan(500);
    refused(read.error);
    const final = await timed(() =>
      offline().finalize(transactionPrototypeFromHex(tx), { inputs: known }),
    );
    expect(final.ms).toBeLessThan(500);
    expect(TxError.is(final.error, "TX_TOO_LARGE")).toBe(true);
    expect(final.error.message).toContain(said);
    expect((final.error as TxBuildError<"TX_TOO_LARGE">).details).toMatchObject(
      {
        maxTxSize: 204_800,
        cause: "referenceScripts",
      },
    );
  });

  it("refuses at once a plan of a step given built past it, the step named", async () => {
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
    const funded = emulator.fund(payTo, { lovelace: 1_000_000_000n });
    const step = runs(
      items,
      funded.input,
      Address.fromBech32(payTo).toBytes().toString(),
    );
    const { error, ms } = await timed(() =>
      builder.plan(
        { given: step },
        { payer: wallet, knownUtxos: known.slice(1) },
      ),
    );
    expect(ms).toBeLessThan(500);
    expect(TxError.is(error, "INVALID_OPTION")).toBe(true);
    expect(error.message).toMatch(/^step "given": invalid tx: its spent/);
    expect(error.message).toContain(said);
  }, 60_000);

  it("reads a transaction at it, and refuses one a byte past it: two Plutus scripts of 102 400 bytes, then one of 102 401", async () => {
    const plutus = (size: number) => `8203${head(2, size)}${"4d".repeat(size)}`;
    const reads = (scripts: string[]) =>
      arr(
        map(
          [uint(0), arr(arr(bytes(txOf(0)), uint(0)))],
          [
            uint(1),
            arr(map([uint(0), bytes(addressHex)], [uint(1), "1a001e8480"])),
          ],
          [uint(2), "1a000f4240"],
          [
            uint(18),
            arr(...scripts.map((_, i) => arr(bytes(txOf(100 + i)), uint(0)))),
          ],
        ),
        map(),
        "f5",
        "f6",
      );
    const given = (scripts: string[]) => [
      mesh(0),
      ...scripts.map((s, i) => mesh(100 + i, s)),
    ];
    const at = [plutus(102_400), plutus(102_400)];
    expect(requiredSigners(reads(at), given(at)).keyHashes).toEqual([KEY_HASH]);
    expect(
      (await offline().fromCbor(reads(at), { knownUtxos: given(at) })).fee,
    ).toBe(1_000_000n);
    const past = [plutus(102_401), plutus(102_400)];
    expect(() => requiredSigners(reads(past), given(past))).toThrow(
      "its spent and reference inputs hold 204801 bytes of reference scripts, more than the 204800",
    );
    const { error } = await timed(() =>
      offline().fromCbor(reads(past), { knownUtxos: given(past) }),
    );
    expect(error.message).toContain("hold 204801 bytes");
  });

  it("reads a transaction that runs 13 such native scripts, 203 359 bytes, with their keys; builds one with them as reference inputs, and refuses to build one with 14", async () => {
    const within = items.slice(0, 13);
    const atBound = runs(within);
    const holders = [
      mesh(0),
      ...within.map((it, i) => mesh(100 + i, `8200${it}`)),
    ];
    expect(requiredSigners(atBound, holders).nativeScripts).toHaveLength(13);
    const read = await offline().fromCbor(atBound, { knownUtxos: holders });
    expect(read.signers.nativeScripts).toHaveLength(13);

    const refs = (n: number) =>
      items
        .slice(0, n)
        .map((it, i) =>
          referenceInput({ utxo: mesh(100 + i, `8200${it}`, "5000000") }),
        );
    const payer = {
      changeAddress: address,
      utxos: [mesh(0, undefined, "1000000000")],
    };
    const pay = output({ address, value: { lovelace: 2_000_000n } });
    const built = await offline().build([pay, ...refs(13)], { payer });
    expect(
      transactionPrototypeFromHex(built.tx).body.reference_inputs,
    ).toHaveLength(13);
    const { error } = await timed(() =>
      offline().build([pay, ...refs(14)], { payer }),
    );
    expect(TxError.is(error, "TX_TOO_LARGE")).toBe(true);
    expect(error.message).toBe(
      `the transaction's spent and reference inputs hold 219002 bytes of reference scripts, more than the 204800 ${said}`,
    );
    expect((error as TxBuildError<"TX_TOO_LARGE">).details).toEqual({
      size: 219_002,
      maxTxSize: 204_800,
      cause: "referenceScripts",
    });
    // So does a mint whose script a reference input past the bound holds
    expect(
      TxError.is(
        (
          await timed(() =>
            offline().build(
              [
                pay,
                ...refs(13),
                mint.native({
                  script: { reference: mesh(200, `8200${items[20]}`) },
                  assets: { "": 1n },
                }),
              ],
              { payer },
            ),
          )
        ).error,
        "TX_TOO_LARGE",
      ),
    ).toBe(true);
  }, 120_000);
});
