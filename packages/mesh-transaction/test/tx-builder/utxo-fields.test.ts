import {
  Cardano,
  Crypto,
  HexBlob,
  Serialization,
  Transaction,
  TxCBOR,
} from "@meshsdk/core-cst";

import {
  output,
  requiredSigners,
  toUtxo,
  TxBuilder,
  Utxo,
} from "../../src/tx-builder";
import {
  outputAsUtxo,
  readUtxo,
  UtxoError,
} from "../../src/tx-builder/parts/utxo";
import { alwaysSucceedCbor } from "../test-util";
import * as cbor from "./cbor-util";
import { setup, VALIDATORS } from "./plan/plan-emulator-util";

/*
 * A transaction unspent output in CBOR is read by its fields: the input, the address and the
 * value by the classes of `@cardano-sdk/core`, the inline datum and the reference script kept as
 * their bytes. Each form gives the UTxO the value decoder of `@cardano-sdk/core` gives, which
 * decodes the datum and the script as well, and each form it refuses is refused with its words.
 */

const KEY_HASH = "77".repeat(28);
const ADDRESS = `60${KEY_HASH}`;
const TX = "ab".repeat(32);
const POLICY = "cd".repeat(28);
/** The input `[TX, 3]` */
const INPUT = cbor.arr(cbor.bytes(TX), cbor.uint(3));
const COIN = "1a004c4b40";
const ASSETS = cbor.arr(
  COIN,
  cbor.map([cbor.bytes(POLICY), cbor.map([cbor.bytes("aa"), cbor.uint(9)])]),
);
/**
 * A datum written longer than needed: the integer 1 in five bytes, in a constructor of
 * indefinite length
 */
const DATUM = "d8799f1a00000001ff";
const DATUM_HASH = "ef".repeat(32);
/** A native reference script, `[0, script]`, and a Plutus one, `[3, code]` */
const NATIVE = `8200${cbor.arr(cbor.uint(0), cbor.bytes(KEY_HASH))}`;
const PLUTUS = `8203${alwaysSucceedCbor}`;
const encoded = (item: string) => `d818${cbor.bytes(item)}`;
const utxo = (out: string) => cbor.arr(INPUT, out);
const key = (n: number, value: string): [string, string] => [
  cbor.uint(n),
  value,
];
const at = (address = ADDRESS) => key(0, cbor.bytes(address));

/** Every form of an output the decoder reads, in a UTxO */
const READ: [string, string][] = [
  ["the array form", utxo(cbor.arr(cbor.bytes(ADDRESS), COIN))],
  [
    "the array form with a datum hash",
    utxo(cbor.arr(cbor.bytes(ADDRESS), COIN, cbor.bytes(DATUM_HASH))),
  ],
  ["the array form with tokens", utxo(cbor.arr(cbor.bytes(ADDRESS), ASSETS))],
  ["the map form", utxo(cbor.map(at(), key(1, COIN)))],
  ["its keys out of order", utxo(cbor.map(key(1, ASSETS), at()))],
  [
    "a datum hash",
    utxo(
      cbor.map(
        at(),
        key(1, COIN),
        key(2, cbor.arr("00", cbor.bytes(DATUM_HASH))),
      ),
    ),
  ],
  [
    "an inline datum",
    utxo(cbor.map(at(), key(1, COIN), key(2, cbor.arr("01", encoded(DATUM))))),
  ],
  [
    "a native reference script",
    utxo(cbor.map(at(), key(1, COIN), key(3, encoded(NATIVE)))),
  ],
  [
    "an inline datum and a Plutus reference script",
    utxo(
      cbor.map(
        at(),
        key(1, ASSETS),
        key(2, cbor.arr("01", encoded(DATUM))),
        key(3, encoded(PLUTUS)),
      ),
    ),
  ],
  [
    "a map of indefinite length",
    utxo(
      cbor.mapIndef(at(), key(1, COIN), key(2, cbor.arr("01", encoded(DATUM)))),
    ),
  ],
  [
    "a datum option of indefinite length",
    utxo(cbor.map(at(), key(1, COIN), key(2, `9f01${encoded(DATUM)}ff`))),
  ],
  [
    "a datum and a script in pieces",
    utxo(
      cbor.map(
        at(),
        key(1, COIN),
        key(2, cbor.arr("01", `d818${cbor.chunkedBytes(DATUM, 2)}`)),
        key(3, `d818${cbor.chunkedBytes(NATIVE, 3)}`),
      ),
    ),
  ],
  [
    "an inline datum, then a datum hash",
    utxo(
      cbor.map(
        at(),
        key(1, COIN),
        key(2, cbor.arr("01", encoded(DATUM))),
        key(2, cbor.arr("00", cbor.bytes(DATUM_HASH))),
      ),
    ),
  ],
  [
    "a datum hash, then an inline datum",
    utxo(
      cbor.map(
        at(),
        key(1, COIN),
        key(2, cbor.arr("00", cbor.bytes(DATUM_HASH))),
        key(2, cbor.arr("01", encoded(DATUM))),
      ),
    ),
  ],
  [
    "two reference scripts",
    utxo(
      cbor.map(
        at(),
        key(1, COIN),
        key(3, encoded(PLUTUS)),
        key(3, encoded(NATIVE)),
      ),
    ),
  ],
  [
    "a datum option with an item after the datum",
    utxo(
      cbor.map(
        at(),
        key(1, COIN),
        key(2, cbor.arr("01", encoded(DATUM), "00")),
      ),
    ),
  ],
];

/** Forms the decoder refuses, each with its words */
const REFUSED: [string, string][] = [
  [
    "a datum of kind 2",
    utxo(cbor.map(at(), key(1, COIN), key(2, cbor.arr("02", encoded(DATUM))))),
  ],
  [
    "an inline datum under tag 25",
    utxo(
      cbor.map(
        at(),
        key(1, COIN),
        key(2, cbor.arr("01", `d819${cbor.bytes(DATUM)}`)),
      ),
    ),
  ],
  [
    "a reference script under tag 25",
    utxo(cbor.map(at(), key(1, COIN), key(3, `d819${cbor.bytes(NATIVE)}`))),
  ],
  [
    "a reference script that is no tag",
    utxo(cbor.map(at(), key(1, COIN), key(3, cbor.bytes(NATIVE)))),
  ],
  ["no address", utxo(cbor.map(key(1, COIN)))],
  ["no value", utxo(cbor.map(at()))],
  [
    "an address that is no byte string",
    utxo(cbor.map(key(0, "00"), key(1, COIN))),
  ],
  ["a value that is no value", utxo(cbor.map(at(), key(1, "f6")))],
  [
    "an address the decoder does not read",
    utxo(cbor.map(at("ff00"), key(1, COIN))),
  ],
];

/** The UTxO the value decoder of `@cardano-sdk/core` gives, the datum and the script decoded */
const decoded = (hex: string): Utxo => {
  const unspent = Serialization.TransactionUnspentOutput.fromCbor(HexBlob(hex));
  return outputAsUtxo(
    unspent.input().transactionId().toString(),
    Number(unspent.input().index()),
    unspent.output(),
  );
};

const refusal = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("not refused");
};

describe("a transaction unspent output in CBOR read by its fields", () => {
  it("gives the UTxO the value decoder gives, of every form it reads, the datum and the script as written", () => {
    for (const [what, hex] of READ) {
      const read = readUtxo(hex);
      expect([what, read]).toEqual([what, decoded(hex)]);
      expect([what, toUtxo(hex)]).toEqual([what, read]);
    }
    // The bytes of the datum are kept as written: the integer 1 in five bytes
    const inline = readUtxo(READ[6]![1]);
    expect(inline.datum).toEqual({
      type: "inline",
      data: { type: "CBOR", content: DATUM },
    });
  });

  it("refuses what the value decoder refuses, in its words", () => {
    for (const [what, hex] of REFUSED) {
      const error = refusal(() => readUtxo(hex)) as UtxoError;
      const words = (
        refusal(() =>
          Serialization.TransactionUnspentOutput.fromCbor(HexBlob(hex)),
        ) as Error
      ).message;
      expect([
        what,
        error instanceof UtxoError,
        error.kind,
        error.message,
      ]).toEqual([
        what,
        true,
        "outRef",
        `not the CBOR of a transaction unspent output: ${words}`,
      ]);
    }
    // A key the ledger takes in no output is refused before the fields are read
    const other = utxo(cbor.map(at(), key(1, COIN), key(4, "00")));
    expect((refusal(() => readUtxo(other)) as Error).message).toBe(
      `the UTxO ${TX}#3 is not the CBOR of a transaction unspent output: its output has a key other than 0, 1, 2 and 3`,
    );
  });

  it("gives fromCbor and requiredSigners the UTxOs the value decoder gives", async () => {
    await Crypto.ready();
    const spent = READ.map(([, hex], i) =>
      hex.replace(INPUT, cbor.arr(cbor.bytes(TX), cbor.uint(i))),
    );
    const body = cbor.map(
      [
        cbor.uint(0),
        cbor.arr(
          ...spent.map((_, i) => cbor.arr(cbor.bytes(TX), cbor.uint(i))),
        ),
      ],
      [cbor.uint(1), cbor.arr(cbor.map(at(), key(1, COIN)))],
      [cbor.uint(2), cbor.uint(1_000_000)],
    );
    const tx = cbor.tx(body, cbor.map());
    const asRead = spent.map(decoded);
    expect(requiredSigners(tx, spent)).toEqual(requiredSigners(tx, asRead));
    const builder = new TxBuilder({ network: "preprod" });
    const fromCbor = await builder.fromCbor(tx, { knownUtxos: spent });
    expect(fromCbor.inputs).toEqual(asRead);
    expect((await builder.fromCbor(tx, { knownUtxos: asRead })).inputs).toEqual(
      asRead,
    );
    expect(Transaction.fromCbor(TxCBOR(fromCbor.tx)).getId()).toBe(
      fromCbor.txHash,
    );
  });
});

describe.each(VALIDATORS)(
  "a payer whose UTxOs are given in CBOR of each form (%s)",
  (validator) => {
    it("builds one payment and one plan from each form, and the plan runs", async () => {
      const ctx = await setup(validator, { funds: [40_000_000n] });
      const [funded] = ctx.funded;
      const address = Cardano.Address.fromBech32(ctx.address).toBytes();
      const input = cbor.arr(
        cbor.bytes(funded!.input.txHash),
        cbor.uint(funded!.input.outputIndex),
      );
      const coin = cbor.uint64(40_000_000n);
      const forms = [
        cbor.arr(input, cbor.arr(cbor.bytes(address), coin)),
        cbor.arr(input, cbor.map(key(1, coin), key(0, cbor.bytes(address)))),
        cbor.arr(
          input,
          cbor.mapIndef(key(0, cbor.bytes(address)), key(1, coin)),
        ),
      ];
      const pay = () => [
        output({ address: ctx.address, value: { lovelace: 5_000_000n } }),
      ];
      const asUtxo = {
        getChangeAddress: async () => ctx.address,
        getUtxos: async () => [toUtxo(funded!)],
      };
      const plain = await ctx.builder.build(pay(), { payer: asUtxo });
      const plainPlan = await ctx.builder.plan(
        { main: pay() },
        { payer: asUtxo },
      );
      for (const form of forms) {
        const payer = {
          getChangeAddress: async () => ctx.address,
          getUtxos: async () => [form],
          signTx: (tx: string, partial?: boolean) =>
            ctx.wallet.signTx(tx, partial),
        };
        const built = await ctx.builder.build(pay(), { payer });
        expect([form, built.tx]).toEqual([form, plain.tx]);
        expect(built.inputs).toEqual([toUtxo(funded!)]);
        const plan = await ctx.builder.plan({ main: pay() }, { payer });
        expect(plan.step("main").inputs).toEqual([toUtxo(funded!)]);
        expect(plan.step("main").txHash).toBe(plainPlan.step("main").txHash);
      }
      const payer = {
        getChangeAddress: async () => ctx.address,
        getUtxos: async () => [forms[2]!],
        signTx: (tx: string, partial?: boolean) =>
          ctx.wallet.signTx(tx, partial),
      };
      const plan = await ctx.builder.plan({ main: pay() }, { payer });
      await plan.run();
      expect(plan.status).toBe("final");
    }, 60_000);
  },
);
