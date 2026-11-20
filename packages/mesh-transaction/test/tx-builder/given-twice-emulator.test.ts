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
/** A read of seconds fails this; a loaded machine's milliseconds do not */
const AT_ONCE_MS = 1_500;
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
      const signers = await timed(() => requiredSigners(one, [spent, a, b]));
      expect(TxError.is(signers.error, "INVALID_OPTION")).toBe(true);
      expect(signers.error.message).toBe(
        `invalid spent: two entries name the output ${ref} and differ`,
      );
      const known = await timed(() =>
        offline().fromCbor(one, { knownUtxos: [spent, a, b] }),
      );
      expect(known.error.message).toBe(
        `invalid knownUtxos: two entries name the output ${ref} and differ`,
      );
      const final = await timed(() =>
        offline().finalize(proto, { inputs: [spent, a, b] }),
      );
      expect(TxError.is(final.error, "INVALID_OPTION")).toBe(true);
      expect(final.error.message).toBe(
        `invalid inputs: two entries name the output ${ref} and differ`,
      );
      const answered = await timed(() =>
        online(new Map([[txOf(100), [a, b]]])).fromCbor(one, {
          knownUtxos: [spent],
        }),
      );
      expect(TxError.is(answered.error, "UTXO_NOT_FOUND")).toBe(true);
      expect(answered.error.message).toBe(
        `fetching the outputs of ${txOf(100)} failed: entries 0 and 1 of the answer name the output ${ref} and differ`,
      );
      const built = await timed(() =>
        offline().build([pay, byOutRef[0]!], {
          payer,
          knownUtxos: [a, b],
        }),
      );
      expect(TxError.is(built.error, "INVALID_OPTION")).toBe(true);
      expect(built.error.message).toBe(
        `invalid knownUtxos: two entries name the output ${ref} and differ`,
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
    // longer form, is not: a text is read once for an out ref
    const text = cborOf(held);
    expect(
      requiredSigners(one, [spent, text, text.toUpperCase()]).keyHashes,
    ).toEqual([KEY_HASH]);
    const longer = `8282${bytes(txOf(100))}1800${text.slice(4 + 68 + 2)}`;
    expect(requiredSigners(one, [spent, longer]).nativeScripts).toHaveLength(1);
    expect(() => requiredSigners(one, [spent, text, longer])).toThrow(
      `invalid spent: two entries name the output ${ref} and differ`,
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
