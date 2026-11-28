import type {
  PlutusDataPrototype,
  TransactionPrototype,
} from "@meshsdk/common";

import { transactionPrototypeFromHex } from "../../src/tx-prototype-from-cbor";
import { plutusDataToPrototype } from "../../src/tx-prototype-from-cbor/plutus-data";
import { transactionPrototypeToHex } from "../../src/tx-prototype-to-cbor";
import { HexBlob, PlutusData } from "../../src/types";

const TX_HASH = "11".repeat(32);
const ADDRESS =
  "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9";

const int = (value: bigint): PlutusDataPrototype => ({
  type: "INTEGER",
  value,
});
const bytes = (value: string): PlutusDataPrototype => ({
  type: "BYTES",
  value,
});

/** `{1: 2, 1: 3}` */
const DATUM: PlutusDataPrototype = {
  type: "MAP",
  value: [
    [int(1n), int(2n)],
    [int(1n), int(3n)],
  ],
};

/** `{7: h'aa', 7: h'bb'}` */
const REDEEMER_DATA: PlutusDataPrototype = {
  type: "MAP",
  value: [
    [int(7n), bytes("aa")],
    [int(7n), bytes("bb")],
  ],
};

/** A transaction whose inline datum, redeemer data and metadata each hold a map that repeats a key */
const repeating = (): TransactionPrototype => ({
  body: {
    fee: "170000",
    inputs: [{ transaction_id: TX_HASH, index: 0 }],
    outputs: [
      {
        address: ADDRESS,
        amount: { coin: "5000000" },
        plutus_data: { type: "DATA", value: { type: "MANUAL", data: DATUM } },
      },
    ],
  },
  is_valid: true,
  witness_set: {
    redeemers: [
      {
        tag: { type: "SPEND" },
        index: "0",
        data: { type: "MANUAL", data: REDEEMER_DATA },
        ex_units: { mem: "1000", steps: "500" },
      },
    ],
  },
  auxiliary_data: {
    prefer_alonzo_format: true,
    metadata: {
      "1": {
        type: "MAP",
        value: [
          [
            { type: "INT", value: 5n },
            { type: "INT", value: 1n },
          ],
          [
            { type: "INT", value: 5n },
            { type: "INT", value: 2n },
          ],
        ],
      },
    },
  },
});

describe("a map that repeats a key", () => {
  it("is shown with every pair, in their order, in a datum, redeemer data and metadata", () => {
    // The encoder writes the datum and the redeemer data as given; the metadata is written here
    // by hand, label 1 as {5: 1, 5: 2}
    const encoded = transactionPrototypeToHex(repeating());
    expect(encoded.endsWith("a101a10502")).toBe(true);
    const hex = `${encoded.slice(0, -10)}a101a205010502`;
    expect(hex).toContain("a201020103");
    expect(hex).toContain("a20741aa0741bb");
    const read = transactionPrototypeFromHex(hex);
    const output = read.body.outputs[0]!;
    expect(output.plutus_data).toEqual({
      type: "DATA",
      value: { type: "MANUAL", data: DATUM },
    });
    expect(read.witness_set.redeemers![0]!.data).toEqual({
      type: "MANUAL",
      data: REDEEMER_DATA,
    });
    expect(read.auxiliary_data!.metadata!["1"]).toEqual(
      repeating().auxiliary_data!.metadata!["1"],
    );
  });

  it("keeps every pair of a map inside a constructor, a list and another map, definite or not", () => {
    // 121([[{1: 2, 1: 3}], {h'00': {4: 5, 4: 6}}]) with the innermost map of indefinite length
    const hex = "d87982" + "81a201020103" + "a14100" + "bf04050406ff";
    expect(plutusDataToPrototype(PlutusData.fromCbor(HexBlob(hex)))).toEqual({
      type: "CONSTR",
      alternative: 0n,
      fields: [
        { type: "LIST", value: [DATUM] },
        {
          type: "MAP",
          value: [
            [
              bytes("00"),
              {
                type: "MAP",
                value: [
                  [int(4n), int(5n)],
                  [int(4n), int(6n)],
                ],
              },
            ],
          ],
        },
      ],
    });
  });

  it("reads constructors of each form and integers beyond 64 bits as before", () => {
    // 1280([]), 102([200, [h'01']]), 2(h'010000000000000000') and -1
    const hex =
      "d9050080" +
      "d86682 18c8 814101".replace(/ /g, "") +
      "c249010000000000000000" +
      "20";
    expect(
      plutusDataToPrototype(PlutusData.fromCbor(HexBlob(`84${hex}`))),
    ).toEqual({
      type: "LIST",
      value: [
        { type: "CONSTR", alternative: 7n, fields: [] },
        { type: "CONSTR", alternative: 200n, fields: [bytes("01")] },
        int(2n ** 64n),
        int(-1n),
      ],
    });
  });
});

describe("a constructor's alternative read as the value decoder reads it", () => {
  /** A constructor of tag `tag` with one field, the integer 0 */
  const constr = (tag: number) => {
    const head =
      tag < 256
        ? `d8${tag.toString(16).padStart(2, "0")}`
        : `d9${tag.toString(16).padStart(4, "0")}`;
    return `${head}8100`;
  };

  it("is the alternative the decoder's constructor gives, for each tag at and past the bounds of each range", () => {
    for (const tag of [
      121, 122, 127, 128, 1279, 1280, 1281, 1400, 1401, 200, 120,
    ]) {
      const data = PlutusData.fromCbor(HexBlob(constr(tag)));
      expect([tag, plutusDataToPrototype(data)]).toEqual([
        tag,
        {
          type: "CONSTR",
          alternative: data.asConstrPlutusData()!.getAlternative(),
          fields: [int(0n)],
        },
      ]);
    }
    // The general form takes its alternative from its array
    const general = PlutusData.fromCbor(HexBlob("d86682188c8100"));
    expect(plutusDataToPrototype(general)).toEqual({
      type: "CONSTR",
      alternative: 140n,
      fields: [int(0n)],
    });
  });

  /** Tags written in nine bytes: 2^64-1024 and every tag above it reach 2^64 as a JS number */
  const LARGE = {
    "2^64-1": "dbffffffffffffffff",
    "2^64-1024": "dbfffffffffffffc00",
    "2^64-1025": "dbfffffffffffffbff",
    "2^53+1": "db0020000000000001",
    "2^63": "db8000000000000000",
    "1400": "db0000000000000578",
  };

  it("is the decoder's for a tag up to 2^64-1, written in nine bytes, with no error", () => {
    for (const [name, head] of Object.entries(LARGE))
      for (const [fields, read] of [
        ["80", []],
        ["8100", [int(0n)]],
        ["9f01ff", [int(1n)]],
      ] as const) {
        const data = PlutusData.fromCbor(HexBlob(`${head}${fields}`));
        expect([name, fields, plutusDataToPrototype(data)]).toEqual([
          name,
          fields,
          {
            type: "CONSTR",
            alternative: data.asConstrPlutusData()!.getAlternative(),
            fields: read,
          },
        ]);
      }
    // As the value decoder reads them: the general form's alternative, 102, past 1400
    const read = (head: string) =>
      plutusDataToPrototype(PlutusData.fromCbor(HexBlob(`${head}80`)));
    expect(read(LARGE["2^64-1"])).toEqual({
      type: "CONSTR",
      alternative: 102n,
      fields: [],
    });
    expect(read(LARGE["1400"])).toEqual({
      type: "CONSTR",
      alternative: 127n,
      fields: [],
    });
  });

  it("is the decoder's for a tag up to 2^64-1 as an inline datum and a redeemer, the witness datum kept", () => {
    for (const head of Object.values(LARGE)) {
      const hex = `${head}8100`;
      const prototype: TransactionPrototype = {
        body: {
          fee: "170000",
          inputs: [{ transaction_id: TX_HASH, index: 0 }],
          outputs: [
            {
              address: ADDRESS,
              amount: { coin: "5000000" },
              plutus_data: { type: "DATA", value: { type: "CBOR", hex } },
            },
          ],
        },
        is_valid: true,
        witness_set: {
          plutus_data: { elems: [hex] },
          redeemers: [
            {
              tag: { type: "SPEND" },
              index: "0",
              data: { type: "CBOR", hex },
              ex_units: { mem: "1000", steps: "500" },
            },
          ],
        },
      };
      const encoded = transactionPrototypeToHex(prototype);
      expect(encoded).toContain(hex);
      const read = transactionPrototypeFromHex(encoded);
      const data = {
        type: "MANUAL",
        data: {
          type: "CONSTR",
          alternative: PlutusData.fromCbor(HexBlob(hex))
            .asConstrPlutusData()!
            .getAlternative(),
          fields: [int(0n)],
        },
      };
      expect([head, read.body.outputs[0]!.plutus_data]).toEqual([
        head,
        { type: "DATA", value: data },
      ]);
      expect([head, read.witness_set.redeemers![0]!.data]).toEqual([
        head,
        data,
      ]);
      expect([head, read.witness_set.plutus_data!.elems]).toEqual([
        head,
        [hex],
      ]);
    }
  });
});
