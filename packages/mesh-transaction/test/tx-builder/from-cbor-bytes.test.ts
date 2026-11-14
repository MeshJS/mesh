import { DEFAULT_PROTOCOL_PARAMETERS, IFetcher, Protocol } from "@meshsdk/core";
import { Crypto, HexBlob, Serialization } from "@meshsdk/core-cst";

import { TxBuilder, TxBuildError, TxError, Utxo } from "../../src/tx-builder";
import {
  arr,
  arrIndef,
  bytes,
  chunkedBytes,
  constr0,
  head,
  map,
  mapIndef,
  tag258,
  tx,
  txHashOf,
  uint,
  uint64,
  vkeyWitness,
} from "./cbor-util";
import { TestKey, testKey } from "./hash-signer-util";

/*
 * The walk over the bytes of a transaction before any of them is decoded: a map that repeats a
 * key, read in different ways by different decoders, is refused; so are a transaction too large
 * and one nested too deep. Plutus data, which may repeat the keys of its maps, is not judged.
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

const REPEATS = "repeats a key, which decoders read in different ways";

describe("TxBuilder.fromCbor › a map that repeats a key", () => {
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

  it.each(cases)("refuses %s in the body, quoting nothing", async (_, made) => {
    const given = made();
    expectRefused(
      await caught(() =>
        offline().fromCbor(given, { knownUtxos: knownUtxos() }),
      ),
      given,
      `a map in its body ${REPEATS}`,
    );
  });

  it("refuses a witness set with two vkey entries, and one with two datum entries", async () => {
    const body = bodyWith();
    const txHash = txHashOf(body);
    for (const witnessSet of [
      map(
        [uint(0), arr(vkeyWitness(key, txHash))],
        [uint(0), arr(vkeyWitness(other, txHash))],
      ),
      map([uint(4), arr("01")], [uint(4), arr("02")]),
      mapIndef([uint(0), arr(vkeyWitness(key, txHash))], [uint(0), arr()]),
    ]) {
      const given = tx(body, witnessSet);
      expectRefused(
        await caught(() =>
          offline().fromCbor(given, { knownUtxos: knownUtxos() }),
        ),
        given,
        `a map in its witness set ${REPEATS}`,
      );
    }
  });

  it("refuses a redeemer map that names one redeemer twice, but not one whose data repeats a key", async () => {
    const units = arr(uint(1000), uint(2000));
    const repeated = map(
      [arr(uint(0), uint(0)), arr("d87980", units)],
      [arr(uint(0), uint(0)), arr("d87a80", units)],
    );
    const given = tx(bodyWith(), map([uint(5), repeated]));
    expectRefused(
      await caught(() =>
        offline().fromCbor(given, { knownUtxos: knownUtxos() }),
      ),
      given,
      `a map in the redeemers of its witness set ${REPEATS}`,
    );
    // A Plutus map in the data may repeat a key: it is lawful, and kept byte for byte
    const data = map([uint(1), uint(0)], [uint(1), uint(1)]);
    const lawful = tx(
      bodyWith(),
      map([uint(5), map([arr(uint(0), uint(0)), arr(data, units)])]),
    );
    const made = await offline().fromCbor(lawful, { knownUtxos: knownUtxos() });
    expect(made.redeemers.map((r) => r.data)).toEqual([data]);
    expect(made.tx).toBe(lawful);
  });

  it("refuses auxiliary data that repeats a label in each of its forms, plain, as an array and tagged, and not a metadatum that repeats a key inside", async () => {
    const twice = map([uint(674), uint(1)], [uint(674), uint(2)]);
    for (const aux of [
      map([uint(1), uint(1)], [uint(1), uint(2)]),
      twice,
      arr(twice, arr()),
      `d90103${map([uint(0), twice])}`,
      `d90103${map([uint(0), map([uint(1), uint(1)])], [uint(0), map()])}`,
    ]) {
      const given = tx(bodyWith(), map(), { aux });
      expectRefused(
        await caught(() =>
          offline().fromCbor(given, { knownUtxos: knownUtxos() }),
        ),
        given,
        `a map in its auxiliary data ${REPEATS}`,
      );
    }
    const inside = map([
      uint(674),
      map([uint(1), uint(1)], [uint(1), uint(2)]),
    ]);
    for (const aux of [
      inside,
      arr(inside, arr()),
      `d90103${map([uint(0), inside])}`,
    ]) {
      const lawful = tx(bodyWith(), map(), { aux });
      const made = await offline().fromCbor(lawful, {
        knownUtxos: knownUtxos(),
      });
      expect(made.tx).toBe(lawful);
    }
  });

  it("refuses redeemers of the array form that name one purpose twice, its index written in any width, and takes those that name each once", async () => {
    const units = arr(uint(1000), uint(2000));
    const redeemer = (tag: string, index: string, data = "d87980") =>
      arr(tag, index, data, units);
    for (const redeemers of [
      arr(redeemer(uint(0), uint(0)), redeemer(uint(0), uint(0), "d87a80")),
      arr(redeemer(uint(0), uint(0)), redeemer(uint(0), "1800", "d87a80")),
      arrIndef(
        redeemer(uint(1), uint(0)),
        redeemer(uint(0), uint(0)),
        redeemer(uint(1), uint(0)),
      ),
    ]) {
      const given = tx(bodyWith(), map([uint(5), redeemers]));
      expectRefused(
        await caught(() =>
          offline().fromCbor(given, { knownUtxos: knownUtxos() }),
        ),
        given,
        "the redeemers of its witness set name one purpose twice, which decoders read in different ways",
      );
    }
    const lawful = tx(
      bodyWith(),
      map([
        uint(5),
        arr(
          redeemer(uint(0), uint(0)),
          redeemer(uint(0), uint(1)),
          redeemer(uint(1), uint(0)),
        ),
      ]),
    );
    const made = await offline().fromCbor(lawful, { knownUtxos: knownUtxos() });
    expect(made.redeemers.map((r) => [r.tag, r.index])).toEqual([
      ["SPEND", 0],
      ["SPEND", 1],
      ["MINT", 0],
    ]);
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

  it("refuses a 2 KB transaction whose datum is nested 1000 deep at once", async () => {
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
      "the transaction nests its items deeper than the 64 levels this library reads",
    );
  });

  it("refuses depth in a script reference, in the data of the witness set and in the auxiliary data, and takes a datum nested 50 deep and one that reaches the limit", async () => {
    const deep = "81".repeat(200) + "00";
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
        "deeper than the 64 levels",
      );
    const made = await offline().fromCbor(nestedDatum(50), {
      knownUtxos: knownUtxos(),
    });
    expect(made.outputs).toHaveLength(1);
    // The datum's lists start at the seventh level: 58 of them reach the 64th, 59 pass it
    await offline().fromCbor(nestedDatum(58), { knownUtxos: knownUtxos() });
    expectRefused(
      await caught(() =>
        offline().fromCbor(nestedDatum(59), { knownUtxos: knownUtxos() }),
      ),
      nestedDatum(59),
      "deeper than the 64 levels",
    );
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
    // Beside the output named, outputs no UTxO can be read from: an address that is no address,
    // and a datum that is no data
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
    // Named, such an output is refused as before
    for (const index of [0, 2]) {
      const error = await caught(() => reading(index));
      expect(TxError.is(error, "UTXO_NOT_FOUND")).toBe(true);
      expect((error as Error).message).toContain(
        `entry ${index} of the answer is not a UTxO`,
      );
    }
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

  it("refuses the CBOR of an inline datum or a script reference written in chunks at once, however deep it nests", async () => {
    // Parameters of a larger maximum size, so that the 20 KB of the deepest are walked
    const builder = new TxBuilder({
      network: "preprod",
      params: { ...params, maxTxSize: 65_536 },
    });
    for (const depth of [1, 1_000, 10_000]) {
      const datum = "9f".repeat(depth) + "ff".repeat(depth);
      const script = arr(uint(0), "81".repeat(depth) + "00");
      for (const given of [
        outputWith([uint(2), arr(uint(1), `d818${oneChunk(datum)}`)]),
        outputWith([uint(3), `d818${oneChunk(script)}`]),
      ]) {
        const started = performance.now();
        const error = await caught(() =>
          builder.fromCbor(given, { knownUtxos: knownUtxos() }),
        );
        expect(performance.now() - started).toBeLessThan(200);
        expectRefused(
          error,
          given,
          "the transaction writes a byte string that holds CBOR (tag 24) in chunks, which no encoder does",
        );
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

  it("reads the slowest data it takes within a bound: 16 384 bytes of one datum as deep as the limit on the decoder's work lets it, and of datums 61 levels deep", async () => {
    for (const given of [deepAndWide(16_384, 6), manyDeep(16_384, 61)]) {
      expect(given.length / 2).toBeLessThanOrEqual(16_384);
      expect(given.length / 2).toBeGreaterThan(16_000);
      const started = performance.now();
      const made = await offline().fromCbor(given, {
        knownUtxos: knownUtxos(),
      });
      // About a second on a laptop
      expect(performance.now() - started).toBeLessThan(15_000);
      expect(made.tx).toBe(given);
    }
  }, 60_000);

  it("refuses at once data that carries more nested work than the decoder is let do, however the size and the depth share it", async () => {
    for (const given of [
      deepAndWide(16_384, 7),
      deepAndWide(16_384, 61),
      deepAndWide(8_192, 31),
      deepAndWide(6_000, 61),
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
    await offline().fromCbor(deepAndWide(4_096, 61), {
      knownUtxos: knownUtxos(),
    });
  }, 60_000);
});

describe("TxBuilder.fromCbor › a key the decoder does not read", () => {
  const UNKNOWN =
    "holds a key this library does not read, which a decoder that does not know it reads in a different way";
  const refusedAs = async (given: string, place: string) =>
    expectRefused(
      await caught(() =>
        offline().fromCbor(given, { knownUtxos: knownUtxos() }),
      ),
      given,
      `invalid tx: a map in ${place} ${UNKNOWN}`,
    );

  it("refuses a body whose unknown key would make the decoder read a ttl or a fee the bytes do not hold", async () => {
    const lawful: [string, string][] = [
      [uint(0), inputs()],
      [uint(1), arr(arr(bytes(`60${key.keyHash}`), uint(9_600_000)))],
      [uint(2), uint(400_000)],
    ];
    // The value 3 of key 25 read as the key of 500, a ttl; the value 2 as the key of a second fee
    for (const extra of [
      [
        [uint(25), uint(3)],
        [uint(500), uint(77)],
      ],
      [
        [uint(25), uint(2)],
        [uint(5_000_000), uint(77)],
      ],
    ] as [string, string][][])
      await refusedAs(tx(map(...lawful, ...extra)), "its body");
    // Key 6, the update proposals of the eras before Conway, and a key after 22
    for (const extra of [
      [uint(6), arr(map(), uint(1))],
      [uint(23), uint(0)],
      [uint(12), uint(0)],
    ] as [string, string][])
      await refusedAs(tx(map(...lawful, extra)), "its body");
    const made = await offline().fromCbor(tx(map(...lawful)), {
      knownUtxos: knownUtxos(),
    });
    expect(made.fee).toBe(400_000n);
  });

  it("refuses an output, or a collateral return, whose unknown key would make the decoder read an inline datum the bytes do not hold", async () => {
    // {0: address, 1: value, 4: 2, [1, 24(h'182a')]: 5}: the value 2 read as the datum's key
    const output = map(
      [uint(0), bytes(`60${key.keyHash}`)],
      [uint(1), uint(3_000_000)],
      [uint(4), uint(2)],
      [arr(uint(1), `d818${bytes("182a")}`), uint(5)],
    );
    await refusedAs(
      tx(
        map(
          [uint(0), inputs()],
          [uint(1), arr(output)],
          [uint(2), uint(170_000)],
        ),
      ),
      "an output of its body",
    );
    await refusedAs(
      tx(
        map(
          [uint(0), inputs()],
          [uint(1), arr(pay(key))],
          [uint(2), uint(170_000)],
          [uint(13), tag258(arr(arr(bytes(IN), uint(1))))],
          [uint(16), output],
        ),
      ),
      "an output of its body",
    );
    // An output in the array form has no keys
    const listed = tx(
      map(
        [uint(0), inputs()],
        [uint(1), arr(arr(bytes(`60${key.keyHash}`), uint(3_000_000)))],
        [uint(2), uint(170_000)],
      ),
    );
    expect(
      (await offline().fromCbor(listed, { knownUtxos: knownUtxos() })).tx,
    ).toBe(listed);
  });

  it("refuses a witness set with a key after 7, and auxiliary data in the tagged form with a key after 4", async () => {
    await refusedAs(tx(bodyWith(), map([uint(8), arr()])), "its witness set");
    await refusedAs(
      tx(bodyWith(), map(), { aux: `d90103${map([uint(5), arr()])}` }),
      "its auxiliary data",
    );
    // Metadata in the plain form is a map of labels, any of which is read
    const labels = tx(bodyWith(), map(), {
      aux: map([uint(9_999), uint(1)], [uint(5), uint(2)]),
    });
    expect(
      (await offline().fromCbor(labels, { knownUtxos: knownUtxos() })).tx,
    ).toBe(labels);
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
});
