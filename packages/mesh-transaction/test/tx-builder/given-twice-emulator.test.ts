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
  output,
  referenceInput,
  requiredSigners,
  toUtxo,
  TxBuilder,
  TxError,
  UtxoInput,
} from "../../src/tx-builder";
import { arr, bytes, head, map, uint } from "./cbor-util";

/*
 * The UTxOs given for out refs are placed by their out refs before any of them is read whole:
 * only those of the out refs a transaction names are read, each out ref once, and the entry the
 * bound on reference scripts counts is the entry read. One out ref given twice with different
 * contents is refused, the out ref named, wherever UTxOs are given for out refs.
 */

const params: Protocol = { ...DEFAULT_PROTOCOL_PARAMETERS };
const KEY_HASH = "77".repeat(28);
const addressHex = `60${KEY_HASH}`;
const address = Address.fromBytes(HexBlob(addressHex)).toBech32();
const txOf = (i: number) => (i + 1).toString(16).padStart(64, "0");
const otherOf = (i: number) => `dd${(i + 1).toString(16).padStart(62, "0")}`;
const key = (i: number) => `8200581c${i.toString(16).padStart(56, "0")}`;
const deepAround = (levels: number, leaf: string) =>
  "820181".repeat(levels) + leaf;
/** A native script of 15 643 bytes, 504 levels deep: all of 20, each nested 250 deep */
const heavy = (i: number) =>
  `820194${deepAround(250, key(i * 16 + 1))}${deepAround(250, key(1)).repeat(19)}`;
/** A native script of 32 bytes */
const light = (i: number) => key(100_000 + i);
const policyOf = (item: string) =>
  Crypto.blake2b.hash(HexBlob(`00${item}`), 28).toString();
const mesh = (
  txHash: string,
  scriptRef?: string,
  lovelace = "50000000",
): UTxO => ({
  input: { txHash, outputIndex: 0 },
  output: {
    address,
    amount: [{ unit: "lovelace", quantity: lovelace }],
    ...(scriptRef !== undefined && { scriptRef }),
  },
});
/** The same UTxO as `mesh` gives, as the CBOR of a transaction unspent output */
const cborOf = (utxo: UTxO) =>
  arr(
    arr(bytes(utxo.input.txHash), uint(utxo.input.outputIndex)),
    map(
      [uint(0), bytes(addressHex)],
      [uint(1), "1a02faf080"],
      ...(utxo.output.scriptRef === undefined
        ? []
        : [
            [uint(3), `d818${bytes(utxo.output.scriptRef)}`] as [
              string,
              string,
            ],
          ]),
    ),
  );
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
/** A provider that answers each transaction hash with the entries `answers` holds for it */
const answering = (answers: ReadonlyMap<string, readonly UtxoInput[]>) =>
  ({
    fetchUTxOs: async (hash: string) => answers.get(hash) ?? [],
    fetchAddressUTxOs: async () => [],
    fetchProtocolParameters: async () => params,
  }) as never;
const online = (answers: ReadonlyMap<string, readonly UtxoInput[]>) =>
  new TxBuilder({ network: "preprod", params, provider: answering(answers) });
/**
 * A read of seconds fails this, a loaded machine's milliseconds do not: about eight times the
 * slowest of these calls in the whole suite on a quiet machine (380 ms), where reading the UTxOs
 * they pass over or refuse takes 6.7 s and more
 */
const AT_ONCE_MS = 3_000;
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

describe("UTxOs given for out refs, each out ref once", () => {
  // 235 scripts of 15 643 bytes: 3 676 105 bytes, eighteen times the bound on reference scripts
  const items = Array.from({ length: 235 }, (_, i) => heavy(i));
  const tx = runs(items);
  const spent = mesh(txOf(0));
  const heavies = items.map((it, i) => mesh(txOf(100 + i), `8200${it}`));
  const lights = items.map((_, i) => mesh(txOf(100 + i), `8200${light(i)}`));
  const orders = {
    "the light first": [spent, ...lights, ...heavies],
    "the heavy first": [spent, ...heavies, ...lights],
  };
  const prototype = transactionPrototypeFromHex(tx);
  /** The reference inputs by out ref, which the build finds among knownUtxos or the provider's */
  const byOutRef = items.map((_, i) =>
    referenceInput({ utxo: { txHash: txOf(100 + i), outputIndex: 0 } }),
  );
  const pay = output({ address, value: { lovelace: 2_000_000n } });
  const payer = {
    changeAddress: address,
    utxos: [mesh(txOf(0), undefined, "1000000000")],
  };

  it.each(Object.entries(orders))(
    "refuses at once each out ref given twice, %s, wherever UTxOs are given for out refs",
    async (_, given) => {
      const answers = new Map(
        given.slice(1).reduce((all, utxo) => {
          const hash = utxo.input.txHash;
          return all.set(hash, [...(all.get(hash) ?? []), utxo]);
        }, new Map<string, UTxO[]>()),
      );
      const places: [string, () => unknown][] = [
        ["requiredSigners", () => requiredSigners(tx, given)],
        [
          "fromCbor, knownUtxos",
          () => offline().fromCbor(tx, { knownUtxos: given }),
        ],
        [
          "fromCbor, the provider's answers",
          () => online(answers).fromCbor(tx, { knownUtxos: [spent] }),
        ],
        ["finalize", () => offline().finalize(prototype, { inputs: given })],
        [
          "build, knownUtxos",
          () =>
            offline().build([pay, ...byOutRef], {
              payer,
              knownUtxos: given.slice(1),
            }),
        ],
        [
          "build, the provider's answers",
          () => online(answers).build([pay, ...byOutRef], { payer }),
        ],
      ];
      for (const [place, run] of places) {
        const { error, ms } = await timed(run);
        expect([place, ms < AT_ONCE_MS]).toEqual([place, true]);
        expect([place, error instanceof TxError]).toEqual([place, true]);
        expect(error.message).toMatch(
          /two entries name the output [0-9a-f]{64}#0 and differ|entries \d+ and \d+ of the answer name the output [0-9a-f]{64}#0 and differ|more than the 204800 a node takes in one transaction/,
        );
      }
    },
    60_000,
  );

  it("refuses an out ref given twice with different contents, in either order and any form, the out ref and the option named", async () => {
    const one = runs(items.slice(0, 1));
    const held = mesh(txOf(100), `8200${items[0]}`);
    const other = mesh(txOf(100), `8200${light(0)}`);
    const ref = `${txOf(100)}#0`;
    const proto = transactionPrototypeFromHex(one);
    for (const [a, b] of [
      [held, other],
      [other, held],
      [cborOf(held), other],
      [held, cborOf(other)],
      [cborOf(held), cborOf(other)],
    ] as [UtxoInput, UtxoInput][]) {
      // Two texts of CBOR are not read to be compared: they name it in different bytes
      const how =
        typeof a === "string" && typeof b === "string"
          ? "in different bytes"
          : "and differ";
      const signers = await timed(() => requiredSigners(one, [spent, a, b]));
      expect(TxError.is(signers.error, "INVALID_OPTION")).toBe(true);
      expect(signers.error.message).toBe(
        `invalid spent: two entries name the output ${ref} ${how}`,
      );
      const known = await timed(() =>
        offline().fromCbor(one, { knownUtxos: [spent, a, b] }),
      );
      expect(known.error.message).toBe(
        `invalid knownUtxos: two entries name the output ${ref} ${how}`,
      );
      const final = await timed(() =>
        offline().finalize(proto, { inputs: [spent, a, b] }),
      );
      expect(TxError.is(final.error, "INVALID_OPTION")).toBe(true);
      expect(final.error.message).toBe(
        `invalid inputs: two entries name the output ${ref} ${how}`,
      );
      const answered = await timed(() =>
        online(new Map([[txOf(100), [a, b]]])).fromCbor(one, {
          knownUtxos: [spent],
        }),
      );
      expect(TxError.is(answered.error, "UTXO_NOT_FOUND")).toBe(true);
      expect(answered.error.message).toBe(
        `fetching the outputs of ${txOf(100)} failed: entries 0 and 1 of the answer name the output ${ref} ${how}`,
      );
      const built = await timed(() =>
        offline().build([pay, byOutRef[0]!], {
          payer,
          knownUtxos: [a, b],
        }),
      );
      expect(TxError.is(built.error, "INVALID_OPTION")).toBe(true);
      expect(built.error.message).toBe(
        `invalid knownUtxos: two entries name the output ${ref} ${how}`,
      );
    }
    // The same UTxO in each form, and the same object or text twice, is one
    const same = [spent, held, cborOf(held), held, cborOf(held)];
    expect(requiredSigners(one, same).nativeScripts).toHaveLength(1);
    expect(
      (await offline().fromCbor(one, { knownUtxos: same })).signers
        .nativeScripts,
    ).toHaveLength(1);
    expect(
      (await offline().finalize(proto, { inputs: same })).referenceInputs,
    ).toHaveLength(1);
    // A text of CBOR in capitals is the same text. Another text of the same UTxO, its index in a
    // longer form, names it in different bytes, and is refused: a text is read once for an out ref
    const text = cborOf(held);
    expect(
      requiredSigners(one, [spent, text, text.toUpperCase()]).keyHashes,
    ).toEqual([KEY_HASH]);
    const longer = `8282${bytes(txOf(100))}1800${text.slice(4 + 68 + 2)}`;
    expect(requiredSigners(one, [spent, longer]).nativeScripts).toHaveLength(1);
    expect(() => requiredSigners(one, [spent, text, longer])).toThrow(
      `invalid spent: two entries name the output ${ref} in different bytes`,
    );
  });

  it("passes over at once the UTxOs given that the transaction does not name, 235 heavy ones among them in each form: requiredSigners, fromCbor, finalize", async () => {
    const one = runs(items.slice(0, 1));
    const proto = transactionPrototypeFromHex(one);
    const unnamed = items.map((it, i) => mesh(otherOf(i), `8200${it}`));
    const given = [
      spent,
      mesh(txOf(100), `8200${items[0]}`),
      ...unnamed,
      ...unnamed.map(cborOf),
      // Not a UTxO past its out ref: never read
      ...unnamed.map((utxo) => ({
        ...utxo,
        output: { ...utxo.output, address: "not an address" },
      })),
    ];
    const signers = await timed(() => requiredSigners(one, given));
    expect(signers.error).toBeUndefined();
    expect(signers.ms).toBeLessThan(AT_ONCE_MS);
    let read: Awaited<ReturnType<TxBuilder["fromCbor"]>> | undefined;
    const known = await timed(async () => {
      read = await offline().fromCbor(one, { knownUtxos: given });
    });
    expect(known.error).toBeUndefined();
    expect(known.ms).toBeLessThan(AT_ONCE_MS);
    expect(read!.signers.nativeScripts).toHaveLength(1);
    const final = await timed(() =>
      offline().finalize(proto, { inputs: given }),
    );
    expect(final.error).toBeUndefined();
    expect(final.ms).toBeLessThan(AT_ONCE_MS);
  });

  it("builds at once reading of knownUtxos and of the provider's answers only the entries its parts name: 235 heavy others passed over in each form, one that is no UTxO past its out ref among them", async () => {
    const unnamed = items.map((it, i) => mesh(otherOf(i), `8200${it}`));
    const notRead = unnamed.map((utxo) => ({
      ...utxo,
      output: { ...utxo.output, address: "not an address" },
    }));
    /** The same UTxO under index 1 of its transaction, which no part names */
    const atOne = (utxo: UTxO): UTxO => ({
      ...utxo,
      input: { ...utxo.input, outputIndex: 1 },
    });
    const answers = new Map(
      items.map((_, i) => [txOf(100 + i), [lights[i]!, atOne(heavies[i]!)]]),
    );
    const places: [string, () => Promise<{ referenceInputs: unknown[] }>][] = [
      [
        "knownUtxos",
        () =>
          offline().build([pay, ...byOutRef], {
            payer,
            knownUtxos: [
              ...lights,
              ...unnamed,
              ...unnamed.map(cborOf),
              ...notRead,
            ],
          }),
      ],
      [
        "the provider's answers",
        () => online(answers).build([pay, ...byOutRef], { payer }),
      ],
    ];
    for (const [place, run] of places) {
      let built: { referenceInputs: unknown[] } | undefined;
      const { error, ms } = await timed(async () => {
        built = await run();
      });
      expect([place, error]).toEqual([place, undefined]);
      expect([place, ms < AT_ONCE_MS]).toEqual([place, true]);
      expect(built!.referenceInputs).toHaveLength(235);
    }
    // Of the entries a part names, two that differ are still refused
    const { error } = await timed(() =>
      offline().build([pay, ...byOutRef], {
        payer,
        knownUtxos: [...lights, ...unnamed, heavies[7]!],
      }),
    );
    expect(error.message).toBe(
      `invalid knownUtxos: two entries name the output ${txOf(107)}#0 and differ`,
    );
  });

  it("refuses at its head an out ref whose transaction hash is not one byte string of definite length of 32 bytes, or whose index is no unsigned integer, as it refuses other out refs: 235 entries of 16 384 bytes, the hash in empty pieces, at once", async () => {
    const one = runs(items.slice(0, 1));
    const proto = transactionPrototypeFromHex(one);
    const held = map([uint(0), bytes(addressHex)], [uint(1), "1a02faf080"]);
    /** An entry of 16 384 bytes for an out ref the transaction does not name */
    const inPieces = (i: number) => {
      const hash = bytes(otherOf(i));
      const empty = 16_384 - 2 - 1 - hash.length / 2 - 1 - 1 - held.length / 2;
      return arr(arr(`5f${"40".repeat(empty)}${hash}ff`, uint(0)), held);
    };
    const pieces = items.map((_, i) => inPieces(i));
    expect(pieces[0]!.length / 2).toBe(16_384);
    const given = [spent, mesh(txOf(100), `8200${items[0]}`), ...pieces];
    /** An out ref of a hash one byte short, which no reader takes */
    const short = arr(arr(bytes(otherOf(0).slice(2)), uint(0)), held);
    /** A message with the reason and the size of the text left out */
    const shape = (message: string) =>
      message
        .replace(/got (a byte string in pieces|62 hex digits)/, "got …")
        .replace(/\d+ hex digits/, "… hex digits");
    const places: [string, (entries: UtxoInput[]) => unknown][] = [
      ["requiredSigners", (entries) => requiredSigners(one, entries)],
      [
        "fromCbor",
        (entries) => offline().fromCbor(one, { knownUtxos: entries }),
      ],
      ["finalize", (entries) => offline().finalize(proto, { inputs: entries })],
      [
        "a payer",
        (entries) =>
          offline().build([pay], {
            payer: { changeAddress: address, utxos: entries },
          }),
      ],
    ];
    for (const [place, run] of places) {
      const { error, ms } = await timed(() => run(given));
      expect([place, ms < AT_ONCE_MS]).toEqual([place, true]);
      expect([place, TxError.is(error, "INVALID_OPTION")]).toEqual([
        place,
        true,
      ]);
      // The message another out ref that cannot be read gets there, its reason told
      const other = (
        await timed(() => run([...given.slice(0, 2), short, ...pieces]))
      ).error;
      expect(shape(error.message)).toBe(shape(other.message));
      expect(error.message).not.toMatch(/40404040/);
    }
    for (const entry of [
      // In one piece
      arr(arr(`5f${bytes(otherOf(0))}ff`, uint(0)), held),
      // Its index as text, as a byte string of no piece, below 0
      arr(arr(bytes(otherOf(0)), "6130"), held),
      arr(arr(bytes(otherOf(0)), "5f40ff"), held),
      arr(arr(bytes(otherOf(0)), "20"), held),
    ])
      expect(() => toUtxo(entry)).toThrow(
        /invalid utxo: invalid (transaction hash|output index)/,
      );
    // A hash of another size is refused at the head too, before the output is looked at: here
    // one with a key other than 0 to 3
    const shortBeside = arr(
      arr(bytes(otherOf(0).slice(2)), uint(0)),
      map(
        [uint(0), bytes(addressHex)],
        [uint(1), "1a02faf080"],
        [uint(4), uint(0)],
      ),
    );
    expect(() => toUtxo(shortBeside)).toThrow(
      "invalid utxo: invalid transaction hash: expected a 32-byte hash in hex; got 62 hex digits",
    );
    // A string of definite length with a longer head, an index in a longer form: read
    const longer = arr(arr(`590020${otherOf(0)}`, "1900ff"), held);
    expect(toUtxo(longer)).toMatchObject({
      txHash: otherOf(0),
      outputIndex: 255,
    });
    expect(
      requiredSigners(one, [spent, longer, ...given.slice(1, 2)]).keyHashes,
    ).toEqual([KEY_HASH]);
  });

  it("refuses at its head a UTxO or an out ref that is no list of two items of definite length, before a piece of it is read, as it refuses other out refs", async () => {
    const one = runs(items.slice(0, 1));
    const proto = transactionPrototypeFromHex(one);
    const held = map([uint(0), bytes(addressHex)], [uint(1), "1a02faf080"]);
    /** The hash of the out ref `i` in 16 000 empty pieces, which a read joins */
    const inPieces = (i: number) =>
      `5f${"40".repeat(16_000)}${bytes(otherOf(i))}ff`;
    const forms: [(hash: string) => string, string][] = [
      [
        (h) => `9f${arr(h, uint(0))}${held}ff`,
        "the UTxO is a list of indefinite length",
      ],
      [(h) => `83${arr(h, uint(0))}${held}00`, "the UTxO is a list of 3 items"],
      [(h) => `81${arr(h, uint(0))}`, "the UTxO is a list of 1 item"],
      [(h) => `a1${arr(h, uint(0))}${held}`, "the UTxO is no list"],
      [
        (h) => `82${`9f${h}${uint(0)}ff`}${held}`,
        "its out ref is a list of indefinite length",
      ],
      [
        (h) => `82${`83${h}${uint(0)}00`}${held}`,
        "its out ref is a list of 3 items",
      ],
      [(h) => `82${`81${h}`}${held}`, "its out ref is a list of 1 item"],
      [(h) => `82${h}${held}`, "its out ref is no list"],
    ];
    const places: [string, (entries: UtxoInput[]) => unknown][] = [
      ["requiredSigners", (entries) => requiredSigners(one, entries)],
      [
        "fromCbor",
        (entries) => offline().fromCbor(one, { knownUtxos: entries }),
      ],
      ["finalize", (entries) => offline().finalize(proto, { inputs: entries })],
      [
        "a payer",
        (entries) =>
          offline().build([pay], {
            payer: { changeAddress: address, utxos: entries },
          }),
      ],
    ];
    for (const [form, what] of forms) {
      const reason = `not the CBOR of a transaction unspent output: ${what}, not a list of two items of definite length`;
      for (const hash of [bytes(otherOf(0)), inPieces(0)])
        expect(() => toUtxo(form(hash))).toThrow(`invalid utxo: ${reason}`);
      // 235 such entries of about 16 KB, the out refs the transaction does not name
      const entries = items.map((_, i) => form(inPieces(i)));
      expect(entries[0]!.length / 2).toBeLessThan(16_384);
      for (const [place, run] of places) {
        const { error, ms } = await timed(() =>
          run([spent, mesh(txOf(100), `8200${items[0]}`), ...entries]),
        );
        expect([what, place, ms < AT_ONCE_MS]).toEqual([what, place, true]);
        expect([what, place, TxError.is(error, "INVALID_OPTION")]).toEqual([
          what,
          place,
          true,
        ]);
        if (place === "a payer") expect(error.message).toContain(reason);
      }
    }
    // Lists of two items with a longer head are of definite length: read
    for (const longer of [
      `9802${arr(bytes(otherOf(0)), uint(7))}${held}`,
      `82${`9802${bytes(otherOf(0))}${uint(7)}`}${held}`,
    ])
      expect(toUtxo(longer)).toMatchObject({
        txHash: otherOf(0),
        outputIndex: 7,
      });
  });

  it("reads at once the same UTxO given many times as one, its script read once", async () => {
    const one = runs(items.slice(0, 1));
    const proto = transactionPrototypeFromHex(one);
    // Copies of one UTxO, each a new object, its members in another order
    const copies = Array.from({ length: 200 }, (_, i) => {
      const { input, output } = mesh(txOf(100), `8200${items[0]}`);
      return i % 2 === 0 ? { input, output } : { output, input };
    });
    const given = [spent, ...copies];
    const signers = await timed(() => requiredSigners(one, given));
    expect(signers.error).toBeUndefined();
    expect(signers.ms).toBeLessThan(AT_ONCE_MS);
    const known = await timed(() =>
      offline().fromCbor(one, { knownUtxos: given }),
    );
    expect(known.error).toBeUndefined();
    expect(known.ms).toBeLessThan(AT_ONCE_MS);
    const final = await timed(() =>
      offline().finalize(proto, { inputs: given }),
    );
    expect(final.error).toBeUndefined();
    expect(final.ms).toBeLessThan(AT_ONCE_MS);
  });

  it("refuses at once a plan of a step given built whose knownUtxos give an out ref twice, in either order", async () => {
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
    for (const knownUtxos of [
      [...lights, ...heavies],
      [...heavies, ...lights],
    ]) {
      const { error, ms } = await timed(() =>
        builder.plan({ given: step }, { payer: wallet, knownUtxos }),
      );
      expect(ms).toBeLessThan(AT_ONCE_MS);
      expect(TxError.is(error, "INVALID_OPTION")).toBe(true);
      expect(error.message).toMatch(
        /invalid knownUtxos: two entries name the output [0-9a-f]{64}#0 and differ|step "given": invalid tx: its spent and reference inputs hold/,
      );
    }
  }, 60_000);
});
