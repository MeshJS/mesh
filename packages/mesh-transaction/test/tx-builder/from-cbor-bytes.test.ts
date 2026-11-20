import { DEFAULT_PROTOCOL_PARAMETERS, IFetcher, Protocol } from "@meshsdk/core";
import { Address, Crypto, HexBlob, Serialization } from "@meshsdk/core-cst";

import {
  addWitnesses,
  requiredSigners,
  TxBuilder,
  TxBuildError,
  TxError,
  Utxo,
} from "../../src/tx-builder";
import { readTxBytes } from "../../src/tx-builder/builder";
import { scanTransaction } from "../../src/tx-builder/tx-scan";
import {
  arr,
  arrIndef,
  byronAddress,
  bytes,
  chunkedBytes,
  constr0,
  head,
  map,
  mapIndef,
  tag258,
  topItems,
  tx,
  txHashOf,
  uint,
  uint64,
  vkeyWitness,
} from "./cbor-util";
import { TestKey, testKey } from "./hash-signer-util";

/*
 * The walk over the bytes of a transaction before any of them is decoded: a transaction too
 * large, nested too deep or that would give the value decoder more work than it is let do is
 * refused. A map that repeats a key, or holds a key the decoder does not know, is read as the
 * decoder reads it: a ledger refuses such a transaction.
 */

const params: Protocol = { ...DEFAULT_PROTOCOL_PARAMETERS };
const offline = () => new TxBuilder({ network: "preprod", params });

let key: TestKey;
let other: TestKey;
beforeAll(async () => {
  await Crypto.ready();
  key = testKey();
  other = testKey();
});

const IN = "11".repeat(32);
const POLICY = "cc".repeat(28);
/** The input set of the bodies below: `IN#0` */
const inputs = (index = 0) => tag258(arr(arr(bytes(IN), uint(index))));
/** An output map paying `lovelace` to the enterprise address of a key */
const pay = (to: TestKey, lovelace = 3_000_000) =>
  map([uint(0), bytes(`60${to.keyHash}`)], [uint(1), uint(lovelace)]);
const knownUtxos = (): Utxo[] => [
  {
    txHash: IN,
    outputIndex: 0,
    address: key.address,
    value: { lovelace: 10_000_000n },
  },
  {
    txHash: IN,
    outputIndex: 1,
    address: other.address,
    value: { lovelace: 10_000_000n },
  },
];
/** A body of these entries, after the inputs, one output and the fee */
const bodyWith = (...extra: [string, string][]) =>
  map(
    [uint(0), inputs()],
    [uint(1), arr(pay(key))],
    [uint(2), uint(170_000)],
    ...extra,
  );

const caught = async (run: () => unknown): Promise<any> => {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("expected an error");
};

/** The message, details and causes of an error, as text */
const everything = (error: unknown): string => {
  const texts: string[] = [];
  let at: unknown = error;
  for (let depth = 0; at instanceof Error && depth < 10; depth++) {
    texts.push(
      at.message,
      JSON.stringify((at as { details?: unknown }).details),
    );
    at = (at as { cause?: unknown }).cause;
  }
  return texts.join("\n");
};

/** Checks a refusal of the transaction: the JavaScript type alone, and no 8 bytes of the text */
const expectRefused = (error: unknown, given: string, reason: string) => {
  expect(error).toBeInstanceOf(TxBuildError);
  expect(TxError.is(error, "INVALID_OPTION")).toBe(true);
  const { details, message, cause } = error as TxBuildError;
  expect(details).toEqual({
    option: "tx",
    value: "string",
    allowed: "a transaction in CBOR hex",
  });
  expect(message).toContain(reason);
  expect(cause).toBeUndefined();
  const text = everything(error).toLowerCase();
  for (let i = 0; i + 16 <= given.length; i += 2)
    expect(text.includes(given.slice(i, i + 16))).toBe(false);
};

describe("TxBuilder.fromCbor › a map that repeats a key, read as the decoder reads it", () => {
  const cases: [string, () => string][] = [
    [
      "two output lists",
      () =>
        tx(
          map(
            [uint(0), inputs()],
            [uint(1), arr(pay(key, 9_000_000))],
            [uint(1), arr(pay(other, 9_000_000))],
            [uint(2), uint(170_000)],
          ),
        ),
    ],
    ["two fees", () => tx(bodyWith([uint(2), uint(1)]))],
    ["two input sets", () => tx(bodyWith([uint(0), inputs(1)]))],
    [
      "two network ids, 0 then 1",
      () => tx(bodyWith([uint(15), uint(0)], [uint(15), uint(1)])),
    ],
    [
      "two network ids, 1 then 0",
      () => tx(bodyWith([uint(15), uint(1)], [uint(15), uint(0)])),
    ],
    [
      "two addresses inside one output",
      () =>
        tx(
          map(
            [uint(0), inputs()],
            [
              uint(1),
              arr(
                map(
                  [uint(0), bytes(`60${key.keyHash}`)],
                  [uint(0), bytes(`60${other.keyHash}`)],
                  [uint(1), uint(3_000_000)],
                ),
              ),
            ],
            [uint(2), uint(170_000)],
          ),
        ),
    ],
    [
      "two values inside one output",
      () =>
        tx(
          map(
            [uint(0), inputs()],
            [
              uint(1),
              arr(
                map(
                  [uint(0), bytes(`60${key.keyHash}`)],
                  [uint(1), uint(3_000_000)],
                  [uint(1), uint(1_000_000)],
                ),
              ),
            ],
            [uint(2), uint(170_000)],
          ),
        ),
    ],
    [
      "two ttl entries",
      () => tx(bodyWith([uint(3), uint(1)], [uint(3), uint(999_999_999)])),
    ],
    [
      "two mint maps",
      () =>
        tx(
          bodyWith(
            [uint(9), map([bytes(POLICY), map([bytes("41"), uint(1)])])],
            [uint(9), map([bytes(POLICY), map([bytes("42"), uint(1)])])],
          ),
        ),
    ],
    [
      "one policy twice in a mint",
      () =>
        tx(
          bodyWith([
            uint(9),
            map(
              [bytes(POLICY), map([bytes("41"), uint(1)])],
              [bytes(POLICY), map([bytes("42"), uint(1)])],
            ),
          ]),
        ),
    ],
    [
      "one policy twice in the value of an output",
      () =>
        tx(
          map(
            [uint(0), inputs()],
            [
              uint(1),
              arr(
                arr(
                  bytes(`60${key.keyHash}`),
                  arr(
                    uint(3_000_000),
                    map(
                      [bytes(POLICY), map([bytes("41"), uint(5)])],
                      [bytes(POLICY), map([bytes("41"), uint(7)])],
                    ),
                  ),
                ),
              ),
            ],
            [uint(2), uint(170_000)],
          ),
        ),
    ],
    [
      "one asset name twice under a policy",
      () =>
        tx(
          bodyWith([
            uint(9),
            map([
              bytes(POLICY),
              map([bytes("41"), uint(1)], [bytes("41"), uint(2)]),
            ]),
          ]),
        ),
    ],
    [
      "one reward account twice in the withdrawals",
      () =>
        tx(
          bodyWith([
            uint(5),
            map(
              [bytes(`e0${key.keyHash}`), uint(5)],
              [bytes(`e0${key.keyHash}`), uint(9)],
            ),
          ]),
        ),
    ],
    [
      "the fee key written in one byte and in two",
      () => tx(bodyWith(["1802", uint(1)])),
    ],
    [
      "the fee key written in one byte and in nine",
      () => tx(bodyWith(["1b0000000000000002", uint(1)])),
    ],
    [
      "a policy written whole and in chunks",
      () =>
        tx(
          bodyWith([
            uint(9),
            map(
              [bytes(POLICY), map([bytes("41"), uint(1)])],
              [chunkedBytes(POLICY, 5), map([bytes("42"), uint(1)])],
            ),
          ]),
        ),
    ],
    [
      "a key twice in a body of indefinite length",
      () =>
        tx(
          mapIndef(
            [uint(0), inputs()],
            [uint(1), arrIndef(pay(key))],
            [uint(2), uint64(170_000)],
            [uint(2), uint64(1)],
          ),
        ),
    ],
  ];

  /** What the value decoder reads of the body of `given` */
  const decodedBody = (given: string) =>
    Serialization.TransactionBody.fromCbor(HexBlob(topItems(given)[0]!));

  it.each(cases)(
    "reads %s in the body as the decoder reads it",
    async (name, made) => {
      const given = made();
      const body = decodedBody(given);
      const read = offline().fromCbor(given, { knownUtxos: knownUtxos() });
      // The decoder reads the last network id, and the last address, whose bytes are judged
      if (name === "two network ids, 0 then 1") {
        expect(body.networkId()).toBe(1);
        expect(TxError.is(await caught(() => read), "NETWORK_MISMATCH")).toBe(
          true,
        );
        return;
      }
      if (name === "two addresses inside one output") {
        expectRefused(
          await caught(() => read),
          given,
          "invalid tx: the address of output 0 has bytes after the address they hold",
        );
        return;
      }
      const object = await read;
      expect(object.tx).toBe(given);
      expect(object.fee).toBe(body.fee());
      expect(object.outputs.map((output) => output.value.lovelace)).toEqual(
        body.outputs().map((output) => output.amount().coin()),
      );
      expect(object.inputs.map((utxo) => utxo.outputIndex)).toEqual(
        body
          .inputs()
          .values()
          .map((input) => Number(input.index())),
      );
    },
  );

  it("reads two fees as the last, and two output lists as the decoder joins them", async () => {
    const fees = tx(bodyWith([uint(2), uint(1)]));
    expect(
      (await offline().fromCbor(fees, { knownUtxos: knownUtxos() })).fee,
    ).toBe(1n);
    const lists = tx(
      map(
        [uint(0), inputs()],
        [uint(1), arr(pay(key, 9_000_000))],
        [uint(1), arr(pay(other, 8_000_000))],
        [uint(2), uint(170_000)],
      ),
    );
    const made = await offline().fromCbor(lists, { knownUtxos: knownUtxos() });
    expect(made.outputs.map((output) => output.value.lovelace)).toEqual([
      9_000_000n,
      8_000_000n,
    ]);
  });

  it("reads a witness set with two vkey entries or two datum entries, redeemers that name one purpose twice and auxiliary data that repeats a label", async () => {
    const body = bodyWith();
    const txHash = txHashOf(body);
    const units = arr(uint(1000), uint(2000));
    const redeemer = (tag: string, index: string, data = "d87980") =>
      arr(tag, index, data, units);
    const twice = map([uint(674), uint(1)], [uint(674), uint(2)]);
    for (const given of [
      tx(
        body,
        map(
          [uint(0), arr(vkeyWitness(key, txHash))],
          [uint(0), arr(vkeyWitness(other, txHash))],
        ),
      ),
      tx(body, map([uint(4), arr("01")], [uint(4), arr("02")])),
      tx(
        body,
        map([
          uint(5),
          map(
            [arr(uint(0), uint(0)), arr("d87980", units)],
            [arr(uint(0), uint(0)), arr("d87a80", units)],
          ),
        ]),
      ),
      tx(
        body,
        map([
          uint(5),
          arr(redeemer(uint(0), uint(0)), redeemer(uint(0), "1800", "d87a80")),
        ]),
      ),
      tx(body, map(), { aux: twice }),
      tx(body, map(), { aux: arr(twice, arr()) }),
      tx(body, map(), { aux: `d90103${map([uint(0), twice])}` }),
    ]) {
      const made = await offline().fromCbor(given, {
        knownUtxos: knownUtxos(),
      });
      expect(made.txHash).toBe(txHash);
    }
    // Both redeemers of one purpose are shown, as the decoder reads them
    const both = await offline().fromCbor(
      tx(
        body,
        map([
          uint(5),
          arr(redeemer(uint(0), uint(0)), redeemer(uint(0), uint(0), "d87a80")),
        ]),
      ),
      { knownUtxos: knownUtxos() },
    );
    expect(both.redeemers.map((r) => [r.tag, r.index, r.data])).toEqual([
      ["SPEND", 0, "d87980"],
      ["SPEND", 0, "d87a80"],
    ]);
  });

  it("reads a witness set that repeats the key of its vkey witnesses as the decoder reads it, the last entry; and refuses to write a witness into one", async () => {
    const body = bodyWith([
      uint(14),
      arr(bytes(key.keyHash), bytes(other.keyHash)),
    ]);
    const txHash = txHashOf(body);
    const given = tx(
      body,
      map(
        [uint(0), arr(vkeyWitness(key, txHash))],
        [uint(0), arr(vkeyWitness(other, txHash))],
      ),
    );
    const read = Serialization.Transaction.fromCbor(HexBlob(given))
      .witnessSet()
      .vkeys()!
      .values()
      .map((witness) => witness.vkey());
    expect(read).toEqual([other.vkey]);
    const made = await offline().fromCbor(given, { knownUtxos: knownUtxos() });
    expect(made.missing.map((m) => m.keyHash)).toEqual([key.keyHash]);
    // The other way round, the key's witness is the one read
    const back = await offline().fromCbor(
      tx(
        body,
        map(
          [uint(0), arr(vkeyWitness(other, txHash))],
          [uint(0), arr(vkeyWitness(key, txHash))],
        ),
      ),
      { knownUtxos: knownUtxos() },
    );
    expect(back.missing.map((m) => m.keyHash)).toEqual([other.keyHash]);
    // A witness is written into no entry of a set that repeats the key
    for (const repeated of [
      given,
      tx(body, map([uint(2), arr()], [uint(2), arr()])),
    ]) {
      const error = await caught(() =>
        addWitnesses(repeated, map([uint(0), arr(vkeyWitness(key, txHash))])),
      );
      expect(TxError.is(error, "INVALID_OPTION")).toBe(true);
      expect((error as Error).message).toContain(
        "its witness set repeats the key of its vkey or bootstrap witnesses",
      );
    }
  });

  it("takes an inline datum and a datum of the witness set whose Plutus map repeats a key, byte for byte", async () => {
    const data = map(
      [bytes("ab"), uint(0)],
      [bytes("ab"), uint(1)],
      ["02", uint(2)],
      ["1802", uint(3)],
    );
    const inline = arr(
      map(
        [uint(0), bytes(`60${key.keyHash}`)],
        [uint(1), uint(3_000_000)],
        [uint(2), arr(uint(1), `d818${bytes(data)}`)],
      ),
    );
    const given = tx(
      map([uint(0), inputs()], [uint(1), inline], [uint(2), uint(170_000)]),
      map([uint(4), tag258(arr(data))]),
    );
    const made = await offline().fromCbor(given, { knownUtxos: knownUtxos() });
    expect(made.tx).toBe(given);
    expect(made.outputs[0]!.datum).toEqual({
      type: "inline",
      data: { type: "CBOR", content: data },
    });
  });
});

describe("TxBuilder.fromCbor › the size and the depth it reads", () => {
  /** A transaction of about 2 KB whose output holds an inline datum of lists nested `depth` deep */
  const nestedDatum = (depth: number) => {
    const datum = "9f".repeat(depth) + "ff".repeat(depth);
    const output = map(
      [uint(0), bytes(`60${key.keyHash}`)],
      [uint(1), uint(3_000_000)],
      [uint(2), arr(uint(1), `d818${bytes(datum)}`)],
    );
    return tx(
      map(
        [uint(0), inputs()],
        [uint(1), arr(output)],
        [uint(2), uint(170_000)],
      ),
    );
  };

  it("refuses at once a 2 KB transaction whose datum is nested 1000 deep: the decoder would take more than a second", async () => {
    const given = nestedDatum(1000);
    expect(given.length / 2).toBeLessThan(2_200);
    const started = performance.now();
    const error = await caught(() =>
      offline().fromCbor(given, { knownUtxos: knownUtxos() }),
    );
    expect(performance.now() - started).toBeLessThan(200);
    expectRefused(
      error,
      given,
      "the transaction carries more nested data than this library reads",
    );
  });

  /**
   * A transaction whose inline datum is byte strings under tag 24, each inside the one before,
   * `count` of them: its deepest item is at level 5 + `count`, and the walk counts little work, a
   * tag's own for each
   */
  const encodedInside = (count: number) => {
    let content = "00";
    for (let i = 1; i < count; i++) content = `d818${bytes(content)}`;
    const output = map(
      [uint(0), bytes(`60${key.keyHash}`)],
      [uint(1), uint(3_000_000)],
      [uint(2), arr(uint(1), `d818${bytes(content)}`)],
    );
    return tx(
      map(
        [uint(0), inputs()],
        [uint(1), arr(output)],
        [uint(2), uint(170_000)],
      ),
    );
  };

  it("walks 1024 levels, the CBOR inside byte strings counted on, and refuses 1025 at once", async () => {
    expect(scanTransaction(encodedInside(1019))).toBeLessThan(100_000_000);
    const given = encodedInside(1020);
    const started = performance.now();
    const error = await caught(() =>
      offline().fromCbor(given, { knownUtxos: knownUtxos() }),
    );
    expect(performance.now() - started).toBeLessThan(200);
    expectRefused(
      error,
      given,
      "the transaction nests its items deeper than the 1024 levels this library reads",
    );
  });

  it("refuses 1 100 levels in a script reference, in the data of the witness set and in the auxiliary data by their depth, and takes a datum nested 50 deep", async () => {
    const deep = "81".repeat(1100) + "00";
    const scriptRef = map(
      [uint(0), bytes(`60${key.keyHash}`)],
      [uint(1), uint(3_000_000)],
      [uint(3), `d818${bytes(arr(uint(0), deep))}`],
    );
    for (const given of [
      tx(
        map(
          [uint(0), inputs()],
          [uint(1), arr(scriptRef)],
          [uint(2), uint(170_000)],
        ),
      ),
      tx(bodyWith(), map([uint(4), arr(deep)])),
      tx(bodyWith(), map(), { aux: map([uint(1), deep]) }),
    ])
      expectRefused(
        await caught(() =>
          offline().fromCbor(given, { knownUtxos: knownUtxos() }),
        ),
        given,
        "deeper than the 1024 levels",
      );
    const made = await offline().fromCbor(nestedDatum(50), {
      knownUtxos: knownUtxos(),
    });
    expect(made.outputs).toHaveLength(1);
  });

  /** A transaction padded with metadata to about `size` bytes, spending `IN#0` */
  const padded = (size: number) => {
    const chunk = bytes("00".repeat(64));
    const count = Math.ceil((size - 150) / (chunk.length / 2));
    return tx(bodyWith(), map(), {
      aux: map([uint(674), arr(...Array<string>(count).fill(chunk))]),
    });
  };

  it("refuses a transaction larger than the protocol's maximum transaction size before any request: the builder's parameters, else 16 384 bytes, none asked for", async () => {
    const calls: string[] = [];
    const provider = {
      fetchUTxOs: async (hash: string) => {
        calls.push(hash);
        return [];
      },
      fetchProtocolParameters: async () => {
        calls.push("parameters");
        return { ...params, maxTxSize: 100_000 };
      },
    } as unknown as IFetcher;
    const given = padded(16_500);
    expect(given.length / 2).toBeGreaterThan(16_384);
    expect(given.length / 2).toBeLessThan(17_000);
    for (const builder of [
      // Parameters given: their maximum, 16 384 here
      new TxBuilder({ network: "preprod", params, provider }),
      // None given: 16 384, and the provider is not asked
      new TxBuilder({ network: "preprod", provider }),
    ])
      expectRefused(
        await caught(() =>
          builder.fromCbor(given, { knownUtxos: knownUtxos() }),
        ),
        given,
        "the transaction is more than the 16384 bytes of the protocol's maximum transaction size",
      );
    expect(calls).toEqual([]);
    // Parameters of a larger maximum let it through, and those of a smaller one refuse less
    const larger = new TxBuilder({
      network: "preprod",
      params: { ...params, maxTxSize: 20_000 },
    });
    const made = await larger.fromCbor(given, { knownUtxos: knownUtxos() });
    expect(made.tx).toBe(given);
    const small = padded(9_000);
    expectRefused(
      await caught(() =>
        new TxBuilder({
          network: "preprod",
          params: { ...params, maxTxSize: 8_192 },
        }).fromCbor(small, { knownUtxos: knownUtxos() }),
      ),
      small,
      "the transaction is more than the 8192 bytes of the protocol's maximum transaction size",
    );
  });

  it("reads at most eight transactions at a time, and every one of them", async () => {
    let open = 0;
    let mostOpen = 0;
    const asked: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const hashes = Array.from({ length: 20 }, (_, i) =>
      (i + 1).toString(16).padStart(64, "e"),
    );
    const provider = {
      fetchUTxOs: async (hash: string) => {
        asked.push(hash);
        open++;
        mostOpen = Math.max(mostOpen, open);
        await gate;
        open--;
        return [
          {
            input: { txHash: hash, outputIndex: 0 },
            output: {
              address: key.address,
              amount: [{ unit: "lovelace", quantity: "2000000" }],
            },
          },
        ];
      },
    } as unknown as IFetcher;
    const given = tx(
      map(
        [
          uint(0),
          tag258(arr(...hashes.map((hash) => arr(bytes(hash), uint(0))))),
        ],
        [uint(1), arr(pay(key))],
        [uint(2), uint(170_000)],
      ),
    );
    const pending = new TxBuilder({
      network: "preprod",
      params,
      provider,
    }).fromCbor(given);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(asked).toHaveLength(8);
    release();
    const made = await pending;
    expect(mostOpen).toBe(8);
    expect([...asked].sort()).toEqual([...hashes].sort());
    expect(made.inputs).toHaveLength(20);
  });

  it("starts no read after one fails", async () => {
    const asked: string[] = [];
    const hashes = Array.from({ length: 20 }, (_, i) =>
      (i + 1).toString(16).padStart(64, "f"),
    );
    // The first read fails at once; the others answer a little later
    const provider = {
      fetchUTxOs: async (hash: string) => {
        asked.push(hash);
        if (asked.length === 1) throw new Error("the provider is down");
        await new Promise((resolve) => setTimeout(resolve, 5));
        return [
          {
            input: { txHash: hash, outputIndex: 0 },
            output: {
              address: key.address,
              amount: [{ unit: "lovelace", quantity: "2000000" }],
            },
          },
        ];
      },
    } as unknown as IFetcher;
    const given = tx(
      map(
        [
          uint(0),
          tag258(arr(...hashes.map((hash) => arr(bytes(hash), uint(0))))),
        ],
        [uint(1), arr(pay(key))],
        [uint(2), uint(170_000)],
      ),
    );
    const error = await caught(() =>
      new TxBuilder({ network: "preprod", params, provider }).fromCbor(given),
    );
    expect(TxError.is(error, "UTXO_NOT_FOUND")).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(asked).toHaveLength(8);
  });

  it("reads only the outputs the body names of each transaction the provider lists", async () => {
    const made = "e0".repeat(32);
    const listed = (address: unknown, outputIndex: number) => ({
      input: { txHash: made, outputIndex },
      output: {
        address,
        amount: [{ unit: "lovelace", quantity: "2000000" }],
      },
    });
    // Beside the output named, an output no UTxO can be read from, an address that is no address,
    // and one whose datum is no data, which is kept as the hex given
    const answer = [
      listed("not an address", 0),
      listed(key.address, 1),
      {
        ...listed(key.address, 2),
        output: { ...listed(key.address, 2).output, plutusData: "ff" },
      },
    ];
    const provider = {
      fetchUTxOs: async () => answer,
    } as unknown as IFetcher;
    const reading = (index: number) =>
      new TxBuilder({ network: "preprod", params, provider }).fromCbor(
        tx(
          map(
            [uint(0), tag258(arr(arr(bytes(made), uint(index))))],
            [uint(1), arr(pay(key))],
            [uint(2), uint(170_000)],
          ),
        ),
      );
    const read = await reading(1);
    expect(read.inputs.map((utxo) => utxo.outputIndex)).toEqual([1]);
    expect((await reading(2)).inputs[0]!.datum).toEqual({
      type: "inline",
      data: { type: "CBOR", content: "ff" },
    });
    // Named, the output with no address is refused as before
    const refused = await caught(() => reading(0));
    expect(TxError.is(refused, "UTXO_NOT_FOUND")).toBe(true);
    expect((refused as Error).message).toContain(
      "entry 0 of the answer is not a UTxO",
    );
    // An entry whose out ref cannot be read is read whole, and refused
    answer.push({ input: { txHash: made } } as never);
    const error = await caught(() => reading(1));
    expect(TxError.is(error, "UTXO_NOT_FOUND")).toBe(true);
    expect((error as Error).message).toContain(
      "entry 3 of the answer is not a UTxO",
    );
  });
});

describe("TxBuilder.fromCbor › the CBOR inside a byte string, and the time data takes", () => {
  /** A byte string of indefinite length holding `content` in one chunk */
  const oneChunk = (content: string) => `5f${bytes(content)}ff`;
  /** A transaction of one output carrying these entries after its address and lovelace */
  const outputWith = (...entries: [string, string][]) =>
    tx(
      map(
        [uint(0), inputs()],
        [
          uint(1),
          arr(
            map(
              [uint(0), bytes(`60${key.keyHash}`)],
              [uint(1), uint(3_000_000)],
              ...entries,
            ),
          ),
        ],
        [uint(2), uint(170_000)],
      ),
    );

  it("walks the CBOR of an inline datum or a script reference written in chunks as the decoder joins it: a datum is read, and deep ones are refused at once", async () => {
    // Parameters of a larger maximum size, so that the 20 KB of the deepest are walked
    const builder = new TxBuilder({
      network: "preprod",
      params: { ...params, maxTxSize: 65_536 },
    });
    const datumOf = (depth: number) => "9f".repeat(depth) + "ff".repeat(depth);
    const made = await builder.fromCbor(
      outputWith([uint(2), arr(uint(1), `d818${oneChunk(datumOf(1))}`)]),
      { knownUtxos: knownUtxos() },
    );
    expect(made.outputs[0]!.datum).toEqual({
      type: "inline",
      data: { type: "CBOR", content: datumOf(1) },
    });
    for (const [depth, reason] of [
      [
        1_000,
        "the transaction carries more nested data than this library reads",
      ],
      [10_000, "deeper than the 1024 levels"],
    ] as const) {
      const script = arr(uint(0), "81".repeat(depth) + "00");
      for (const given of [
        outputWith([uint(2), arr(uint(1), `d818${oneChunk(datumOf(depth))}`)]),
        outputWith([uint(3), `d818${oneChunk(script)}`]),
      ]) {
        const started = performance.now();
        const error = await caught(() =>
          builder.fromCbor(given, { knownUtxos: knownUtxos() }),
        );
        expect(performance.now() - started).toBeLessThan(200);
        expectRefused(error, given, reason);
      }
    }
  });

  it("takes a byte string in chunks that holds no CBOR: Plutus bytes of more than 64, inline and in the witness set", async () => {
    const long = `5f${bytes("ab".repeat(64))}${bytes("cd".repeat(16))}ff`;
    const datum = constr0(long);
    const given = tx(
      map(
        [uint(0), inputs()],
        [
          uint(1),
          arr(
            map(
              [uint(0), bytes(`60${key.keyHash}`)],
              [uint(1), uint(3_000_000)],
              [uint(2), arr(uint(1), `d818${bytes(datum)}`)],
            ),
          ),
        ],
        [uint(2), uint(170_000)],
      ),
      map([uint(4), arr(datum)]),
    );
    const made = await offline().fromCbor(given, { knownUtxos: knownUtxos() });
    expect(made.tx).toBe(given);
    expect(made.outputs[0]!.datum).toEqual({
      type: "inline",
      data: { type: "CBOR", content: datum },
    });
  });

  it("decodes the body, the witness set, the auxiliary data and the data they carry once, with key witnesses or without", async () => {
    const datum = constr0(arr(uint(1), uint(2)), bytes("ab"));
    const body = map(
      [uint(0), inputs()],
      [
        uint(1),
        arr(
          map(
            [uint(0), bytes(`60${key.keyHash}`)],
            [uint(1), uint(3_000_000)],
            [uint(2), arr(uint(1), `d818${bytes(datum)}`)],
          ),
        ),
      ],
      [uint(2), uint(170_000)],
    );
    const aux = map([uint(674), arr(uint(1), uint(2))]);
    const data: [string, string] = [uint(4), arr(datum, datum)];
    const decoders = [
      Serialization.TransactionBody,
      Serialization.TransactionWitnessSet,
      Serialization.AuxiliaryData,
      Serialization.PlutusData,
    ] as const;
    /** The calls of each decoder while `run` runs */
    const callsOf = async (run: () => unknown) => {
      const spies = decoders.map((decoder) => jest.spyOn(decoder, "fromCbor"));
      try {
        await run();
        return spies.map((spy) => spy.mock.calls.length);
      } finally {
        for (const spy of spies) spy.mockRestore();
      }
    };
    // What one decode of each part takes
    const once = await callsOf(() => {
      Serialization.TransactionBody.fromCbor(HexBlob(body));
      Serialization.TransactionWitnessSet.fromCbor(HexBlob(map(data)));
      Serialization.AuxiliaryData.fromCbor(HexBlob(aux));
    });
    expect(once[3]).toBeGreaterThan(0);
    for (const witnessSet of [
      map(data),
      map([uint(0), arr(vkeyWitness(key, txHashOf(body)))], data),
    ]) {
      const given = tx(body, witnessSet, { aux });
      const calls = await callsOf(() =>
        offline().fromCbor(given, { knownUtxos: knownUtxos() }),
      );
      expect(calls).toEqual(once);
    }
  });

  /**
   * A transaction of about `size` bytes whose witness set holds one datum: lists nested `depth`
   * deep, the innermost holding as many zeros as fit
   */
  const deepAndWide = (size: number, depth: number) => {
    const made = (n: number) =>
      tx(
        bodyWith(),
        map([
          uint(4),
          arr(
            "9f".repeat(depth - 1) +
              head(4, n) +
              "00".repeat(n) +
              "ff".repeat(depth - 1),
          ),
        ]),
      );
    let n = size - 200;
    while (made(n).length / 2 > size) n -= 10;
    return made(n);
  };
  /** A transaction of about `size` bytes whose witness set holds datums of lists `depth` deep */
  const manyDeep = (size: number, depth: number) => {
    const datum = "9f".repeat(depth) + "ff".repeat(depth);
    return tx(
      bodyWith(),
      map([
        uint(4),
        arr(...Array<string>(Math.floor((size - 200) / depth / 2)).fill(datum)),
      ]),
    );
  };

  /** A transaction of one datum in its witness set: lists nested `depth` deep */
  const oneDeep = (depth: number) =>
    tx(
      bodyWith(),
      map([uint(4), arr("9f".repeat(depth) + "ff".repeat(depth))]),
    );

  it("reads the slowest data it takes within a bound: 16 384 bytes of one datum as wide as the limit on the decoder's work lets it, of datums 50 levels deep, and one datum 720 levels deep", async () => {
    for (const given of [
      deepAndWide(16_384, 2),
      manyDeep(16_384, 50),
      oneDeep(720),
    ]) {
      const started = performance.now();
      const made = await offline().fromCbor(given, {
        knownUtxos: knownUtxos(),
      });
      // About a second on a laptop
      expect(performance.now() - started).toBeLessThan(15_000);
      expect(made.tx).toBe(given);
    }
  }, 60_000);

  it("refuses at once data that carries more nested work than the decoder is let do, however the size and the depth share it: datums of 16 384 bytes nested 128 levels and deeper, and one datum 1018 levels deep", async () => {
    for (const given of [
      manyDeep(16_384, 128),
      manyDeep(16_384, 256),
      manyDeep(16_384, 512),
      manyDeep(16_384, 1000),
      deepAndWide(16_384, 4),
      deepAndWide(16_384, 61),
      deepAndWide(8_192, 31),
      oneDeep(1018),
    ]) {
      const started = performance.now();
      const error = await caught(() =>
        offline().fromCbor(given, { knownUtxos: knownUtxos() }),
      );
      expect(performance.now() - started).toBeLessThan(200);
      expectRefused(
        error,
        given,
        "the transaction carries more nested data than this library reads",
      );
    }
    // The same data under the limit is taken
    await offline().fromCbor(deepAndWide(2_048, 61), {
      knownUtxos: knownUtxos(),
    });
  }, 60_000);

  /**
   * A transaction of about `size` bytes holding, where `where` says, a datum of lists nested
   * `depth` deep around one byte string written in one-byte pieces, as many as fit
   */
  const inPieces = (
    where: "witness set" | "inline datum" | "redeemer" | "metadata",
    depth: number,
    size = 16_384,
  ) => {
    const made = (n: number) => {
      const data =
        "9f".repeat(depth) + `5f${"4100".repeat(n)}ff` + "ff".repeat(depth);
      switch (where) {
        case "witness set":
          return tx(bodyWith(), map([uint(4), arr(data)]));
        case "inline datum":
          return tx(
            map(
              [uint(0), inputs()],
              [
                uint(1),
                arr(
                  map(
                    [uint(0), bytes(`60${key.keyHash}`)],
                    [uint(1), uint(3_000_000)],
                    [uint(2), arr(uint(1), `d818${bytes(data)}`)],
                  ),
                ),
              ],
              [uint(2), uint(170_000)],
            ),
          );
        case "redeemer":
          return tx(
            bodyWith(),
            map([
              uint(5),
              map([arr(uint(0), uint(0)), arr(data, arr(uint(1), uint(1)))]),
            ]),
          );
        case "metadata":
          return tx(bodyWith(), map(), { aux: map([uint(1), data]) });
      }
    };
    let n = Math.floor(size / 2);
    while (made(n).length / 2 > size) n -= 10;
    return made(n);
  };

  it("counts each piece of a string written in pieces for every container around it: a datum of lists around a byte string of 7 700 one-byte pieces is refused at once, in the witness set, inline, in a redeemer and in metadata, at 100 and 400 levels, and at 64 KB", async () => {
    for (const where of [
      "witness set",
      "inline datum",
      "redeemer",
      "metadata",
    ] as const)
      for (const depth of [100, 400]) {
        const given = inPieces(where, depth);
        expect(given.length / 2).toBeGreaterThan(16_300);
        const started = performance.now();
        const error = await caught(() =>
          offline().fromCbor(given, { knownUtxos: knownUtxos() }),
        );
        expect(performance.now() - started).toBeLessThan(1_000);
        expectRefused(
          error,
          given,
          "the transaction carries more nested data than this library reads",
        );
      }
    // At 65 536 bytes, the bound of `after` without parameters, 232 levels deep
    const large = new TxBuilder({
      network: "preprod",
      params: { ...params, maxTxSize: 65_536 },
    });
    const given = inPieces("witness set", 232, 65_536);
    expect(given.length / 2).toBeGreaterThan(65_400);
    const error = await caught(() =>
      large.fromCbor(given, { knownUtxos: knownUtxos() }),
    );
    expectRefused(
      error,
      given,
      "the transaction carries more nested data than this library reads",
    );
    // A text string in pieces in metadata counts as a byte string does
    const text = tx(bodyWith(), map(), {
      aux: map([
        uint(1),
        "9f".repeat(400) + `7f${"6161".repeat(7_700)}ff` + "ff".repeat(400),
      ]),
    });
    expectRefused(
      await caught(() =>
        offline().fromCbor(text, { knownUtxos: knownUtxos() }),
      ),
      text,
      "the transaction carries more nested data than this library reads",
    );
  }, 60_000);

  it("counts a tag and a string in pieces as their decoders read them: a constructor is read with readers of its own whatever it holds, and pieces are joined copying the string at each", async () => {
    /** Datums of lists `depth` deep around `n` items, each `item` */
    const listOf = (n: number, depth: number, item: string) =>
      tx(
        bodyWith(),
        map([
          uint(4),
          arr(
            "9f".repeat(depth) +
              head(4, n) +
              item.repeat(n) +
              "ff".repeat(depth),
          ),
        ]),
      );
    expect(scanTransaction(listOf(1_000, 0, "d87980"))).toBeGreaterThan(
      1_000 * 60_000,
    );
    const filled = (depth: number) => {
      let n = 5_500;
      while (listOf(n, depth, "d87980").length / 2 > 16_384) n -= 10;
      return listOf(n, depth, "d87980");
    };
    await offline().fromCbor(filled(9), { knownUtxos: knownUtxos() });
    const given = filled(12);
    expectRefused(
      await caught(() =>
        offline().fromCbor(given, { knownUtxos: knownUtxos() }),
      ),
      given,
      "the transaction carries more nested data than this library reads",
    );
    // An inline datum of one list around a byte string in 8 000 one-byte pieces counts about
    // twice the list of 8 000 one-byte strings: the list, and the string that holds the pieces
    const inline = (data: string) =>
      tx(
        map(
          [uint(0), inputs()],
          [
            uint(1),
            arr(
              map(
                [uint(0), bytes(`60${key.keyHash}`)],
                [uint(1), uint(3_000_000)],
                [uint(2), arr(uint(1), `d818${bytes(data)}`)],
              ),
            ),
          ],
          [uint(2), uint(170_000)],
        ),
      );
    const pieced = scanTransaction(inline(`9f5f${"4100".repeat(8_000)}ffff`))!;
    const strings = scanTransaction(inline(`9f${"4100".repeat(8_000)}ff`))!;
    expect(pieced).toBeGreaterThan(1.9 * strings);
  }, 60_000);

  it("reads a byte string of 10 KB in 64-byte pieces, as Plutus data writes a long one, a few constructors down, in the witness set and inline", async () => {
    const long = `5f${`5840${"ab".repeat(64)}`.repeat(160)}ff`;
    const datum = "d8799f".repeat(4) + long + "ff".repeat(4);
    const given = tx(
      map(
        [uint(0), inputs()],
        [
          uint(1),
          arr(
            map(
              [uint(0), bytes(`60${key.keyHash}`)],
              [uint(1), uint(30_000_000)],
              [uint(2), arr(uint(1), `d818${bytes(datum)}`)],
            ),
          ),
        ],
        [uint(2), uint(170_000)],
      ),
      map([uint(4), arr(datum)]),
    );
    expect(given.length / 2).toBeGreaterThan(20_000);
    const made = await new TxBuilder({
      network: "preprod",
      params: { ...params, maxTxSize: 32_768 },
    }).fromCbor(given, { knownUtxos: knownUtxos() });
    expect(made.tx).toBe(given);
    expect(made.outputs[0]!.datum).toEqual({
      type: "inline",
      data: { type: "CBOR", content: datum },
    });
  }, 60_000);
});

describe("TxBuilder.fromCbor › a key the decoder does not read, read as the decoder reads it", () => {
  const read = (given: string) =>
    offline().fromCbor(given, { knownUtxos: knownUtxos() });
  /** A refusal of the decoder: the transaction as a whole, with its type alone */
  const notRead = async (given: string) => {
    const error = await caught(() => read(given));
    expect(TxError.is(error, "INVALID_OPTION")).toBe(true);
    expect((error as TxBuildError).details).toEqual({
      option: "tx",
      value: "string",
      allowed: "a transaction in CBOR hex",
    });
  };

  it("passes over the value of a body key the decoder does not know, as the decoder does: a ledger refuses it", async () => {
    const lawful: [string, string][] = [
      [uint(0), inputs()],
      [uint(1), arr(arr(bytes(`60${key.keyHash}`), uint(9_600_000)))],
      [uint(2), uint(400_000)],
    ];
    // Neither the value 77 nor the key 500 is read as a ttl or a fee
    for (const extra of [
      [uint(500), uint(77)],
      [uint(12), uint(0)],
      [uint(24), uint(0)],
      [uint(27), arr(uint(1), uint(2))],
      [uint(6), arr(map(), uint(1))],
    ] as [string, string][]) {
      const given = tx(map(...lawful, extra));
      const made = await read(given);
      expect(made.tx).toBe(given);
      expect(made.fee).toBe(400_000n);
      expect(made.validity?.invalidHereafter).toBeUndefined();
    }
    // Keys 23, 25 and 26, the sub transactions, direct deposits and balance intervals of a later
    // era, are read by the decoder, which refuses them in another form
    for (const extra of [
      [uint(23), uint(0)],
      [uint(23), arr()],
      [uint(25), uint(3)],
      [uint(25), map()],
      [uint(26), map()],
    ] as [string, string][])
      await notRead(tx(map(...lawful, extra)));
    expect((await read(tx(map(...lawful)))).fee).toBe(400_000n);
  });

  it("refuses required signers written as credentials, which the decoder reads as the guards of a later era and no signer", async () => {
    const lawful: [string, string][] = [
      [uint(0), inputs()],
      [uint(1), arr(arr(bytes(`60${key.keyHash}`), uint(9_600_000)))],
      [uint(2), uint(400_000)],
    ];
    for (const guards of [
      arr(arr(uint(0), bytes(other.keyHash))),
      tag258(
        arr(arr(uint(0), bytes(other.keyHash)), arr(uint(1), bytes(POLICY))),
      ),
    ]) {
      const given = tx(map(...lawful, [uint(14), guards]));
      const error = await caught(() => read(given));
      expect(TxError.is(error, "INVALID_OPTION")).toBe(true);
      expect((error as Error).message).toContain(
        "its required signers are credentials",
      );
      let signers: unknown;
      try {
        signers = requiredSigners(given, knownUtxos());
      } catch (e) {
        signers = e;
      }
      expect(TxError.is(signers, "INVALID_OPTION")).toBe(true);
    }
    // The key hashes of Conway are read, each a signer
    const made = await read(
      tx(map(...lawful, [uint(14), tag258(arr(bytes(other.keyHash)))])),
    );
    expect(made.missing.map((m) => m.keyHash).sort()).toEqual(
      [key.keyHash, other.keyHash].sort(),
    );
  });

  it("passes over an output key the decoder does not know, as the decoder does, and refuses a key after it that is not an integer", async () => {
    const output = (...extra: [string, string][]) =>
      tx(
        map(
          [uint(0), inputs()],
          [
            uint(1),
            arr(
              map(
                [uint(0), bytes(`60${key.keyHash}`)],
                [uint(1), uint(3_000_000)],
                ...extra,
              ),
            ),
          ],
          [uint(2), uint(170_000)],
        ),
      );
    // {0: address, 1: value, 4: 2}: the value 2 is passed over, no datum is read from it
    const made = await read(output([uint(4), uint(2)]));
    expect(made.outputs[0]!.datum).toBeUndefined();
    // {0: address, 1: value, 4: 2, [1, 24(h'182a')]: 5}
    await notRead(
      output(
        [uint(4), uint(2)],
        [arr(uint(1), `d818${bytes("182a")}`), uint(5)],
      ),
    );
  });

  it("passes over a witness set key after 7 and reads Plutus V4 scripts in tagged auxiliary data, as the decoder does; refuses a key after 5 there", async () => {
    for (const given of [
      tx(bodyWith(), map([uint(8), arr()])),
      tx(bodyWith(), map([uint(24), uint(0)])),
      tx(bodyWith(), map(), { aux: `d90103${map([uint(5), arr()])}` }),
    ])
      expect((await read(given)).tx).toBe(given);
    await notRead(
      tx(bodyWith(), map(), { aux: `d90103${map([uint(6), arr()])}` }),
    );
    // Metadata in the plain form is a map of labels, any of which is read
    const labels = tx(bodyWith(), map(), {
      aux: map([uint(9_999), uint(1)], [uint(5), uint(2)]),
    });
    expect((await read(labels)).tx).toBe(labels);
  });
});

describe("TxBuilder.fromCbor › forms a decoder takes and a ledger does not", () => {
  const read = (given: string, known = knownUtxos()) =>
    caught(() => offline().fromCbor(given, { knownUtxos: known }));

  it("refuses a transaction that is not an array of four items: of three, of five, a map", async () => {
    const body = bodyWith();
    for (const given of [
      arr(body, map(), "f6"),
      arr(body, map(), map([uint(1), uint(1)])),
      arr(body, map(), "f5", "f6", "f6"),
      map([uint(0), body]),
    ])
      expectRefused(
        await read(given),
        given,
        "the transaction is not an array of four items (its body, witness set, validity flag and auxiliary data): the forms of earlier eras are not read",
      );
  });

  it("refuses at once what is not well-formed CBOR (RFC 8949) in a script reference, an inline datum, the data of the witness set and the auxiliary data: a simple value below 32 in two bytes, which the reader takes; additional information 28 to 30; a break with nothing open; a piece of another kind inside a string in pieces", async () => {
    const places = (item: string) => [
      tx(
        map(
          [uint(0), inputs()],
          [
            uint(1),
            arr(
              map(
                [uint(0), bytes(`60${key.keyHash}`)],
                [uint(1), uint(3_000_000)],
                [
                  uint(3),
                  `d818${bytes(arr(uint(0), arr(uint(1), arr(item))))}`,
                ],
              ),
            ),
          ],
          [uint(2), uint(170_000)],
        ),
      ),
      tx(
        map(
          [uint(0), inputs()],
          [
            uint(1),
            arr(
              map(
                [uint(0), bytes(`60${key.keyHash}`)],
                [uint(1), uint(3_000_000)],
                [uint(2), arr(uint(1), `d818${bytes(arr(item))}`)],
              ),
            ),
          ],
          [uint(2), uint(170_000)],
        ),
      ),
      tx(bodyWith(), map([uint(4), arr(arr(item))])),
      tx(bodyWith(), map(), { aux: map([uint(674), arr(item)]) }),
    ];
    for (const item of [
      "f800",
      "f81f",
      ...["1c", "3d", "5e", "7c", "9d", "be", "dc", "fd", "fe"],
      "ff",
      "5f6161ff",
      "7f4100ff",
    ])
      for (const given of places(item)) {
        expect(() => scanTransaction(given)).toThrow(
          "expected a transaction in CBOR hex: it is not well-formed CBOR",
        );
        const started = performance.now();
        const error = await read(given);
        expect(performance.now() - started).toBeLessThan(200);
        expectRefused(error, given, "it is not well-formed CBOR");
      }
    // A simple value of 32 in two bytes is well formed: the walk takes it
    for (const given of places("f820"))
      expect(scanTransaction(given)).toBeGreaterThan(0);
  });

  it("refuses a negative fee", async () => {
    const given = tx(
      map(
        [uint(0), inputs()],
        [uint(1), arr(pay(key, 10_200_000))],
        [uint(2), "3a00030d40"],
      ),
    );
    expectRefused(await read(given), given, "invalid tx: its fee is negative");
  });

  it("refuses a token quantity of zero in an output, in the collateral return and in the mint", async () => {
    const zero = map([bytes(POLICY), map([bytes("41"), uint(0)])]);
    const withZero = map(
      [uint(0), bytes(`60${key.keyHash}`)],
      [uint(1), arr(uint(3_000_000), zero)],
    );
    const cases: [string, string][] = [
      [
        tx(
          map(
            [uint(0), inputs()],
            [uint(1), arr(pay(key), withZero)],
            [uint(2), uint(170_000)],
          ),
        ),
        "invalid tx: output 1 holds a token in a quantity of zero",
      ],
      [
        tx(
          bodyWith(
            [uint(13), tag258(arr(arr(bytes(IN), uint(1))))],
            [uint(16), withZero],
          ),
        ),
        "invalid tx: its collateral return holds a token in a quantity of zero",
      ],
      [
        tx(bodyWith([uint(9), zero])),
        "invalid tx: its mint holds a token in a quantity of zero",
      ],
    ];
    for (const [given, message] of cases)
      expectRefused(await read(given), given, message);
  });

  it("refuses an out ref named twice among the inputs, the collateral inputs or the reference inputs, and takes one named in two of them", async () => {
    const twice = tag258(arr(arr(bytes(IN), uint(1)), arr(bytes(IN), uint(1))));
    const cases: [string, string][] = [
      [
        tx(
          map(
            [
              uint(0),
              tag258(arr(arr(bytes(IN), uint(0)), arr(bytes(IN), uint(0)))),
            ],
            [uint(1), arr(pay(key))],
            [uint(2), uint(170_000)],
          ),
        ),
        "invalid tx: its inputs name one output twice",
      ],
      [
        tx(
          map(
            [uint(0), arr(arr(bytes(IN), uint(0)), arr(bytes(IN), uint(0)))],
            [uint(1), arr(pay(key))],
            [uint(2), uint(170_000)],
          ),
        ),
        "invalid tx: its inputs name one output twice",
      ],
      [
        tx(bodyWith([uint(13), twice])),
        "invalid tx: its collateral inputs name one output twice",
      ],
      [
        tx(bodyWith([uint(18), twice])),
        "invalid tx: its reference inputs name one output twice",
      ],
    ];
    for (const [given, message] of cases)
      expectRefused(await read(given), given, message);
    // One out ref as an input and as a collateral input is each set's own business
    const made = await offline().fromCbor(
      tx(bodyWith([uint(13), tag258(arr(arr(bytes(IN), uint(0))))])),
      { knownUtxos: knownUtxos() },
    );
    expect(made.collateral!.inputs).toHaveLength(1);
  });

  it("refuses an output address whose bytes run past the address they hold, and takes a pointer address written exactly", async () => {
    const at = (address: string) =>
      tx(
        map(
          [uint(0), inputs()],
          [
            uint(1),
            arr(map([uint(0), bytes(address)], [uint(1), uint(3_000_000)])),
          ],
          [uint(2), uint(170_000)],
        ),
      );
    for (const given of [
      at(`40${key.keyHash}010203ff`),
      at(`40${key.keyHash}01020300`),
    ])
      expectRefused(
        await read(given),
        given,
        "invalid tx: the address of output 0 has bytes after the address they hold",
      );
    const exact = at(`40${key.keyHash}010203`);
    const made = await offline().fromCbor(exact, { knownUtxos: knownUtxos() });
    expect(made.tx).toBe(exact);
  });

  it("refuses at once a transaction that pays an address longer than 256 bytes, before its base58 is written: a Byron address of 15 KB, and one of 257 bytes in an output of each form, as the collateral return, under a repeated key and in a second output list; reads one of 256 bytes", async () => {
    const outputTo = (address: string) =>
      map([uint(0), bytes(address)], [uint(1), uint(3_000_000)]);
    const paying = (...outputs: string[]) =>
      tx(
        map(
          [uint(0), inputs()],
          [uint(1), arr(...outputs)],
          [uint(2), uint(170_000)],
        ),
      );
    const long = byronAddress(206);
    expect(long.length / 2).toBe(257);
    const given = [
      paying(outputTo(byronAddress(15_000))),
      paying(pay(key), outputTo(long)),
      paying(arr(bytes(long), uint(3_000_000))),
      tx(bodyWith([uint(16), outputTo(long)])),
      paying(
        map(
          [uint(0), bytes(long)],
          [uint(0), bytes(`60${key.keyHash}`)],
          [uint(1), uint(3_000_000)],
        ),
      ),
      tx(bodyWith([uint(1), arr(outputTo(long))])),
    ];
    const reason =
      "the transaction pays an address longer than the 256 bytes this library reads";
    for (const each of given) {
      const started = performance.now();
      const error = await caught(() =>
        offline().fromCbor(each, { knownUtxos: knownUtxos() }),
      );
      expect(performance.now() - started).toBeLessThan(500);
      expectRefused(error, each, reason);
    }
    // A transaction of `after` and the transaction of a JSON are bounded the same
    expect(readTxBytes(given[0]!, 65_536)).toBeUndefined();
    const json = (
      await offline().fromCbor(paying(pay(key)), { knownUtxos: knownUtxos() })
    ).toJSON();
    const refused = await caught(() =>
      offline().restore({ ...json, built: { ...json.built, tx: given[0]! } }),
    );
    expect(TxError.is(refused, "INVALID_OPTION")).toBe(true);
    expect((refused as Error).message).toContain(reason);
    const longest = paying(outputTo(byronAddress(205)));
    const made = await offline().fromCbor(longest, {
      knownUtxos: knownUtxos(),
    });
    expect(made.outputs[0]!.address).toBe(
      Address.fromBytes(HexBlob(byronAddress(205))).toBase58(),
    );
  });
});
