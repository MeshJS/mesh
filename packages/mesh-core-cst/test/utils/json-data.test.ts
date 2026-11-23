import { builtinByteString } from "@meshsdk/common";
import {
  applyParamsToScript,
  fromBuilderToPlutusData,
  fromJsonToPlutusData,
} from "@meshsdk/core-cst";

/*
 * The `bytes` of Plutus data in the JSON form are hex of whole bytes, in either case: anything
 * else is refused, its text quoted nowhere, never read up to its first bad digit or with its last
 * digit dropped (which would make of `abc` the bytes `ab`, and of `zz` no bytes).
 */

const MESSAGE =
  "Malformed bytes field in Plutus data, expected hex of whole bytes";

/** `bytes` that are not hex of whole bytes, each with a run of it a message would show */
const BAD: [string, string][] = [
  ["abc", "abc"],
  ["zz", "zz"],
  ["abzz", "abzz"],
  ["zzab", "zzab"],
  ["ab cd", "ab cd"],
  ["0xab", "0xab"],
  [`d8799f${"01".repeat(40)}f`, "d8799f0101"],
  ["ABC", "ABC"],
];

/** Each placed alone, in a constructor's fields, in a list, as a map's key and as its value */
const placed = (bytes: string): [string, object][] => [
  ["alone", { bytes }],
  ["in a constructor", { constructor: 0, fields: [{ bytes }] }],
  ["in a list", { list: [{ int: 1 }, { bytes }] }],
  ["a map's key", { map: [{ k: { bytes }, v: { int: 1 } }] }],
  ["a map's value", { map: [{ k: { int: 1 }, v: { bytes } }] }],
];

const refusal = (run: () => unknown): Error => {
  try {
    run();
  } catch (error) {
    return error as Error;
  }
  throw new Error("expected a refusal");
};

describe("The bytes of Plutus data in the JSON form", () => {
  it("are refused when not hex of whole bytes, alone and nested, quoting none of them", () => {
    for (const [bytes, shown] of BAD)
      for (const [where, json] of placed(bytes)) {
        const at = [bytes, where];
        for (const run of [
          () => fromJsonToPlutusData(json),
          () => fromBuilderToPlutusData({ type: "JSON", content: json }),
          () =>
            fromBuilderToPlutusData({
              type: "JSON",
              content: JSON.stringify(json),
            }),
        ]) {
          const error = refusal(run);
          expect([at, error.message]).toEqual([at, MESSAGE]);
          expect([at, error.message.includes(shown)]).toEqual([at, false]);
        }
      }
  });

  it("are refused as a parameter applied to a script in the JSON form", () => {
    const script =
      "584501000032323232323222533300432323253330073370e900018041baa0011324a2600c0022c60120026012002600600229309b2b118021baa0015734aae7555cf2ba157441";
    for (const bytes of ["123", "zz"])
      expect(() => applyParamsToScript(script, [{ bytes }], "JSON")).toThrow(
        MESSAGE,
      );
    // Hex of whole bytes as before
    expect(
      applyParamsToScript(script, [builtinByteString("1234")], "JSON"),
    ).toBe(
      "584f584d010000332323232323222533300432323253330073370e900018041baa0011324a2600c0022c60120026012002600600229309b2b118021baa0015734aae7555cf2ba157449801034212340001",
    );
  });

  it("are read as before when hex of whole bytes, in either case, empty or long", () => {
    const cases: [object, string][] = [
      [{ bytes: "abcd" }, "42abcd"],
      [{ bytes: "ABCD" }, "42abcd"],
      [{ bytes: "aBcD" }, "42abcd"],
      [{ bytes: "" }, "40"],
      [
        { bytes: "ab".repeat(100) },
        `5f5840${"ab".repeat(64)}5824${"ab".repeat(36)}ff`,
      ],
      [
        {
          constructor: 1,
          fields: [
            { list: [{ bytes: "00ff" }] },
            { map: [{ k: { bytes: "AA" }, v: { bytes: "" } }] },
          ],
        },
        "d87a9f9f4200ffffa141aa40ff",
      ],
    ];
    for (const [json, cbor] of cases) {
      expect([json, fromJsonToPlutusData(json).toCbor().toString()]).toEqual([
        json,
        cbor,
      ]);
      expect([
        json,
        fromBuilderToPlutusData({ type: "JSON", content: JSON.stringify(json) })
          .toCbor()
          .toString(),
      ]).toEqual([json, cbor]);
    }
  });
});
