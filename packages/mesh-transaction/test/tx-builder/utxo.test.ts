import {
  NativeScript,
  OutputDatumInput,
  PlutusScript,
  resolveDataHash,
  resolveNativeScriptHash,
  resolveScriptRef,
  UTxO,
} from "@meshsdk/core";
import {
  Address,
  HexBlob,
  normalizePlutusScript,
  Script,
  toTxUnspentOutput,
  TransactionId,
  TransactionInput,
  TransactionOutput,
  TransactionUnspentOutput,
  Value,
} from "@meshsdk/core-cst";

import {
  NativeScriptInput,
  output,
  OutputDatum,
  OutRef,
  PlutusScriptInput,
  spend,
  TxBuildError,
  Utxo,
  UtxoInput,
  ValueInput,
} from "../../src/tx-builder";
import {
  describeScriptRef,
  outputAsUtxo,
  outRefOf,
  plainUtxo,
  readOutRef,
  readUtxo,
  scriptRefOf,
  scriptSize,
  toMeshUtxo,
  toUtxo,
  UtxoError,
  utxoKey,
  UtxoProblem,
} from "../../src/tx-builder/parts/utxo";
import { toAssets, valueOf } from "../../src/tx-builder/value";
import { alwaysSucceedCbor, baseAddress, keyHashHex } from "../test-util";
import * as cbor from "./cbor-util";

const address = baseAddress(1);
const byron = "Ae2tdPwUPEZ4YjgvykNpoFeYUxoyhNj2kg8KfKWN2FizsSpLUPv68MpTVDo";
const reward =
  "stake_test1uqevw2xnsc0pvn9t9r9c7qryfqfeerchgrlm3ea2nefr9hqp8n5xl";
const hash = (n: number) => n.toString(16).padStart(2, "0").repeat(32);
const unitA = "ab".repeat(28);
const unitB = "cd".repeat(28) + "0102";
/** The most lovelace, or of a token, an output can hold, and a quantity a number cannot hold */
const MAX_QUANTITY = 2n ** 64n - 1n;
const ABOVE_SAFE = 2n ** 53n + 1n;

/** A Plutus program: flat, in one CBOR wrapping, and in the double wrapping parts store */
const single = normalizePlutusScript(alwaysSucceedCbor, "SingleCBOR");
const flat = normalizePlutusScript(alwaysSucceedCbor, "PurePlutusScriptBytes");
const double = normalizePlutusScript(alwaysSucceedCbor, "DoubleCBOR");
const nativeScript: NativeScript = {
  type: "all",
  scripts: [{ type: "sig", keyHash: keyHashHex(1) }],
};
const nativeCbor = resolveScriptRef(nativeScript).slice(4);

/** The hash of a reference script as core-cst reads it from `[language, script]` */
const refHash = (scriptRef: string) =>
  Script.fromCbor(HexBlob(scriptRef)).hash().toString();

const plutusRef = (version: "V1" | "V2" | "V3"): Utxo["script"] => ({
  type: "plutus",
  version,
  code: double,
  hash: refHash(resolveScriptRef({ code: double, version })),
});

/** Each fixture in the builder's form and as a Mesh `UTxO` */
const fixtures: Record<string, { utxo: Utxo; mesh: UTxO }> = {
  "ada only": {
    utxo: {
      txHash: hash(1),
      outputIndex: 0,
      address,
      value: { lovelace: 5_000_000n },
    },
    mesh: {
      input: { txHash: hash(1), outputIndex: 0 },
      output: { address, amount: [{ unit: "lovelace", quantity: "5000000" }] },
    },
  },
  "tokens listed out of order": {
    utxo: {
      txHash: hash(2),
      outputIndex: 1,
      address,
      value: { lovelace: 2_000_000n, [unitA]: 1n, [unitB]: 7n },
    },
    mesh: {
      input: { txHash: hash(2), outputIndex: 1 },
      output: {
        address,
        amount: [
          { unit: unitB, quantity: "7" },
          { unit: "lovelace", quantity: "2000000" },
          { unit: unitA, quantity: "1" },
        ],
      },
    },
  },
  "an inline datum in non-canonical CBOR": {
    utxo: {
      txHash: hash(3),
      outputIndex: 2,
      address,
      value: { lovelace: 3_000_000n },
      datum: { type: "inline", data: { type: "CBOR", content: "d8799fff" } },
    },
    mesh: {
      input: { txHash: hash(3), outputIndex: 2 },
      output: {
        address,
        amount: [{ unit: "lovelace", quantity: "3000000" }],
        plutusData: "d8799fff",
        dataHash: resolveDataHash("d8799fff", "CBOR"),
      },
    },
  },
  "a datum hash": {
    utxo: {
      txHash: hash(4),
      outputIndex: 3,
      address,
      value: { lovelace: 3_000_000n },
      datum: { type: "hash", hash: hash(0xab) },
    },
    mesh: {
      input: { txHash: hash(4), outputIndex: 3 },
      output: {
        address,
        amount: [{ unit: "lovelace", quantity: "3000000" }],
        dataHash: hash(0xab),
      },
    },
  },
  ...Object.fromEntries(
    (["V1", "V2", "V3"] as const).map((version, i) => [
      `a Plutus ${version} reference script`,
      {
        utxo: {
          txHash: hash(5 + i),
          outputIndex: 4,
          address,
          value: { lovelace: 9_000_000n },
          script: plutusRef(version),
        },
        mesh: {
          input: { txHash: hash(5 + i), outputIndex: 4 },
          output: {
            address,
            amount: [{ unit: "lovelace", quantity: "9000000" }],
            scriptRef: resolveScriptRef({ code: double, version }),
          },
        },
      },
    ]),
  ),
  "a native reference script": {
    utxo: {
      txHash: hash(8),
      outputIndex: 5,
      address,
      value: { lovelace: 9_000_000n },
      script: {
        type: "native",
        cbor: nativeCbor,
        hash: resolveNativeScriptHash(nativeScript),
      },
    },
    mesh: {
      input: { txHash: hash(8), outputIndex: 5 },
      output: {
        address,
        amount: [{ unit: "lovelace", quantity: "9000000" }],
        scriptRef: resolveScriptRef(nativeScript),
      },
    },
  },
  "quantities above 2^53, up to 2^64 - 1": {
    utxo: {
      txHash: hash(10),
      outputIndex: 65535,
      address,
      value: {
        lovelace: MAX_QUANTITY,
        [unitA]: ABOVE_SAFE,
        [unitB]: MAX_QUANTITY,
      },
    },
    mesh: {
      input: { txHash: hash(10), outputIndex: 65535 },
      output: {
        address,
        amount: [
          { unit: unitB, quantity: "18446744073709551615" },
          { unit: "lovelace", quantity: "18446744073709551615" },
          { unit: unitA, quantity: "9007199254740993" },
        ],
      },
    },
  },
  "a Byron address": {
    utxo: {
      txHash: hash(9),
      outputIndex: 6,
      address: byron,
      value: { lovelace: 1_000_000n },
    },
    mesh: {
      input: { txHash: hash(9), outputIndex: 6 },
      output: {
        address: byron,
        amount: [{ unit: "lovelace", quantity: "1000000" }],
      },
    },
  },
};

/**
 * The CBOR of a Mesh UTxO; one at a Byron address is encoded by hand, as the converter reads
 * bech32 only
 */
const cborOf = (mesh: UTxO) => {
  if (mesh.output.address !== byron)
    return toTxUnspentOutput(mesh).toCbor().toString();
  expect(mesh.output.amount).toHaveLength(1);
  return new TransactionUnspentOutput(
    new TransactionInput(
      TransactionId(mesh.input.txHash),
      BigInt(mesh.input.outputIndex),
    ),
    new TransactionOutput(
      Address.fromBase58(byron),
      new Value(BigInt(mesh.output.amount[0]!.quantity)),
    ),
  )
    .toCbor()
    .toString();
};

/** The CBOR of a Mesh UTxO with one run of its bytes replaced */
const cborWith = (mesh: UTxO, from: string, to: string) => {
  const cbor = cborOf(mesh);
  expect(cbor).toContain(from);
  return cbor.replace(from, to);
};

const ada = fixtures["ada only"]!;
const large = fixtures["quantities above 2^53, up to 2^64 - 1"]!;
const inline = fixtures["an inline datum in non-canonical CBOR"]!;
const v3 = fixtures["a Plutus V3 reference script"]!;

/** A Mesh UTxO: the `ada only` fixture with these output members */
const meshWith = (output: Partial<UTxO["output"]>): UTxO => ({
  input: { ...ada.mesh.input },
  output: { ...ada.mesh.output, ...output },
});

/** A `Utxo`: the `ada only` fixture with these members, as untyped data */
const ownWith = (members: Record<string, unknown>): unknown => ({
  ...ada.utxo,
  ...members,
});

/** The kind of the `UtxoError` `readUtxo` throws for a value, or "accepted" */
const kindOf = (given: unknown): UtxoProblem | "accepted" => {
  try {
    readUtxo(given);
    return "accepted";
  } catch (error) {
    if (error instanceof UtxoError) return error.kind;
    throw error;
  }
};

describe("Utxo forms", () => {
  describe.each(Object.entries(fixtures))("%s", (_, { utxo, mesh }) => {
    it("the three forms give the same Utxo", () => {
      expect(toUtxo(mesh)).toStrictEqual(utxo);
      expect(toUtxo(cborOf(mesh))).toStrictEqual(utxo);
      expect(toUtxo(utxo)).toStrictEqual(utxo);
    });

    it("is idempotent and survives structuredClone", () => {
      const once = toUtxo(mesh);
      expect(toUtxo(once)).toStrictEqual(once);
      expect(toUtxo(structuredClone(once))).toStrictEqual(once);
      // A clone is made in the test runner's other realm: equal, not of one prototype
      expect(structuredClone(once)).toEqual(once);
    });

    it("writes back to the same Mesh UTxO and the same CBOR", () => {
      const back = toMeshUtxo(utxo);
      expect(toUtxo(back)).toStrictEqual(utxo);
      expect(cborOf(back)).toBe(cborOf(mesh));
      expect(toMeshUtxo(cborOf(mesh))).toStrictEqual(back);
    });
  });

  it("shares nothing with what it is given", () => {
    const withDatum = {
      ...fixtures["a native reference script"]!.utxo,
      datum: inline.utxo.datum!,
    };
    const copy = toUtxo(withDatum);
    expect(copy).not.toBe(withDatum);
    expect(copy.value).not.toBe(withDatum.value);
    expect(copy.datum).not.toBe(withDatum.datum);
    expect(copy.datum).toStrictEqual(withDatum.datum);
    expect(copy.script).not.toBe(withDatum.script);
    expect(copy.script).toStrictEqual(withDatum.script);
    const { input, output } = fixtures["tokens listed out of order"]!.mesh;
    const mesh: UTxO = {
      input: { ...input },
      output: { ...output, amount: output.amount.map((a) => ({ ...a })) },
    };
    const fromMesh = toUtxo(mesh);
    (mesh.output.amount[0] as { quantity: string }).quantity = "8";
    mesh.input.txHash = hash(0xee);
    expect(fromMesh.value[unitB]).toBe(7n);
    expect(fromMesh.txHash).toBe(hash(2));
  });

  it("drops the members that are not a UTxO's", () => {
    const built = { ...ada.utxo, label: "pay", change: true as const };
    expect(toUtxo(built)).toStrictEqual(ada.utxo);
    expect(Object.keys(toUtxo(built))).toEqual([
      "txHash",
      "outputIndex",
      "address",
      "value",
    ]);
  });
});

describe("Utxo normal form", () => {
  it("puts hex in lower case", () => {
    const upper = toUtxo({
      input: { txHash: hash(0xab).toUpperCase(), outputIndex: 1 },
      output: {
        address,
        amount: [
          { unit: "lovelace", quantity: "3" },
          { unit: unitB.toUpperCase(), quantity: "2" },
        ],
        plutusData: "D87980",
        scriptRef: resolveScriptRef(nativeScript).toUpperCase(),
      },
    });
    expect(upper.txHash).toBe(hash(0xab));
    expect(upper.value).toStrictEqual({ lovelace: 3n, [unitB]: 2n });
    expect(upper.datum).toStrictEqual({
      type: "inline",
      data: { type: "CBOR", content: "d87980" },
    });
    expect(upper.script).toStrictEqual(
      fixtures["a native reference script"]!.utxo.script,
    );
    const own = toUtxo({
      ...ada.utxo,
      txHash: hash(0xcd).toUpperCase(),
      value: { lovelace: 1n, [unitA.toUpperCase()]: 2n, [unitA]: 3n },
      datum: { type: "hash", hash: hash(0xef).toUpperCase() },
    });
    expect(own.txHash).toBe(hash(0xcd));
    expect(own.value).toStrictEqual({ lovelace: 1n, [unitA]: 5n });
    expect(own.datum).toStrictEqual({ type: "hash", hash: hash(0xef) });
  });

  it("writes an address given in hex as bech32", () => {
    const hex = Address.fromBech32(address).toBytes().toString();
    expect(hex).not.toBe(address);
    expect(toUtxo(meshWith({ address: hex })).address).toBe(address);
    expect(toUtxo(ownWith({ address: hex }) as Utxo).address).toBe(address);
  });

  it("puts lovelace first and the tokens in the order of their units", () => {
    const unitC = "01".repeat(28);
    const utxo = toUtxo(
      meshWith({
        amount: [
          { unit: unitB, quantity: "1" },
          { unit: unitA, quantity: "1" },
          { unit: unitC, quantity: "1" },
          { unit: "lovelace", quantity: "1" },
        ],
      }),
    );
    expect(Object.keys(utxo.value)).toEqual(["lovelace", unitC, unitA, unitB]);
    const own = toUtxo({
      ...ada.utxo,
      value: { [unitB]: 1n, [unitA]: 1n, lovelace: 1n },
    });
    expect(Object.keys(own.value)).toEqual(["lovelace", unitA, unitB]);
    expect(
      Object.keys(toMeshUtxo(own).output.amount.map((a) => a.unit)),
    ).toEqual(["0", "1", "2"]);
    expect(toMeshUtxo(own).output.amount.map((a) => a.unit)).toEqual([
      "lovelace",
      unitA,
      unitB,
    ]);
  });

  it("leaves out a token of quantity zero", () => {
    expect(
      toUtxo(meshWith({ amount: [{ unit: unitA, quantity: "0" }] })).value,
    ).toStrictEqual({ lovelace: 0n });
    expect(
      toUtxo({ ...ada.utxo, value: { lovelace: 1n, [unitA]: 0n } }).value,
    ).toStrictEqual({ lovelace: 1n });
  });

  it("adds up repeated units, reading the empty unit as lovelace", () => {
    const utxo = toUtxo(
      meshWith({
        amount: [
          { unit: "lovelace", quantity: "20" },
          { unit: "", quantity: "20" },
          { unit: unitA, quantity: "1" },
          { unit: "lovelace", quantity: "10" },
          { unit: unitA.toUpperCase(), quantity: "2" },
        ],
      }),
    );
    expect(utxo.value).toStrictEqual({ lovelace: 50n, [unitA]: 3n });
  });

  it("accepts the largest output index in every form", () => {
    expect(toUtxo(ownWith({ outputIndex: 65535 }) as Utxo).outputIndex).toBe(
      65535,
    );
    const mesh: UTxO = {
      ...ada.mesh,
      input: { ...ada.mesh.input, outputIndex: 65535 },
    };
    expect(toUtxo(mesh).outputIndex).toBe(65535);
    expect(toUtxo(cborOf(mesh)).outputIndex).toBe(65535);
    expect(readOutRef(mesh).outputIndex).toBe(65535);
    expect(readOutRef(cborOf(mesh)).outputIndex).toBe(65535);
    expect(
      readOutRef({ txHash: hash(1), outputIndex: 65535 }).outputIndex,
    ).toBe(65535);
  });

  it("keeps quantities up to 2^64 - 1 exact, and repeats that add up to it", () => {
    expect(toUtxo(large.mesh).value).toStrictEqual({
      lovelace: 18446744073709551615n,
      [unitA]: 9007199254740993n,
      [unitB]: 18446744073709551615n,
    });
    expect(toMeshUtxo(large.utxo).output.amount).toStrictEqual([
      { unit: "lovelace", quantity: "18446744073709551615" },
      { unit: unitA, quantity: "9007199254740993" },
      { unit: unitB, quantity: "18446744073709551615" },
    ]);
    expect(toTxUnspentOutput(toMeshUtxo(large.utxo)).toCbor().toString()).toBe(
      cborOf(large.mesh),
    );
    const summed = toUtxo(
      meshWith({
        amount: [
          { unit: "lovelace", quantity: "18446744073709551614" },
          { unit: "", quantity: "1" },
          { unit: unitA, quantity: "9007199254740992" },
          { unit: unitA, quantity: "1" },
        ],
      }),
    );
    expect(summed.value).toStrictEqual({
      lovelace: MAX_QUANTITY,
      [unitA]: ABOVE_SAFE,
    });
  });

  it("gives 0n lovelace to an amount without a lovelace entry", () => {
    const utxo = toUtxo(meshWith({ amount: [{ unit: unitA, quantity: "4" }] }));
    expect(utxo.value).toStrictEqual({ lovelace: 0n, [unitA]: 4n });
    expect(toUtxo(meshWith({ amount: [] })).value).toStrictEqual({
      lovelace: 0n,
    });
  });

  it("reads empty Mesh members as absent", () => {
    const utxo = toUtxo(
      meshWith({
        plutusData: "",
        dataHash: "",
        scriptRef: "",
        scriptHash: "",
      }),
    );
    expect(utxo).toStrictEqual(ada.utxo);
  });
});

describe("Utxo refusals", () => {
  const ref = ada.mesh.input;

  it.each<[string, unknown, UtxoProblem]>([
    ["a number", 5, "outRef"],
    ["null", null, "outRef"],
    ["an object of neither form", { outputIndex: 0, address }, "outRef"],
    [
      "an object of both forms",
      { ...ada.mesh, address, value: { lovelace: 1n } },
      "outRef",
    ],
    ["a Mesh UTxO and a txHash", { ...ada.mesh, txHash: hash(1) }, "outRef"],
    ["a transaction hash that is not hex", ownWith({ txHash: "zz" }), "outRef"],
    [
      "a short transaction hash",
      ownWith({ txHash: "ab".repeat(31) }),
      "outRef",
    ],
    ["an output index above 65535", ownWith({ outputIndex: 65536 }), "outRef"],
    ["a negative output index", ownWith({ outputIndex: -1 }), "outRef"],
    ["a fractional output index", ownWith({ outputIndex: 1.5 }), "outRef"],
    ["an output index as text", ownWith({ outputIndex: "1" }), "outRef"],
    [
      "a Mesh output index above 65535",
      { ...ada.mesh, input: { ...ref, outputIndex: 70000 } },
      "outRef",
    ],
    ["a Mesh UTxO without an input", { output: ada.mesh.output }, "outRef"],
    ["text that is not hex", "not cbor", "outRef"],
    ["text that is not the CBOR of a UTxO", "84a400", "outRef"],
    [
      "an address that does not parse",
      ownWith({ address: "addr1x" }),
      "address",
    ],
    ["no address", ownWith({ address: undefined }), "address"],
    ["a reward address", ownWith({ address: reward }), "address"],
    ["a Mesh reward address", meshWith({ address: reward }), "address"],
    ["no value", ownWith({ value: undefined }), "value"],
    ["a value without lovelace", ownWith({ value: { [unitA]: 1n } }), "value"],
    ["lovelace as a number", ownWith({ value: { lovelace: 5 } }), "value"],
    ["lovelace as text", ownWith({ value: { lovelace: "5" } }), "value"],
    ["a negative quantity", ownWith({ value: { lovelace: -1n } }), "value"],
    [
      "a token as a number",
      ownWith({ value: { lovelace: 1n, [unitA]: 1 } }),
      "value",
    ],
    ["a bad unit", ownWith({ value: { lovelace: 1n, abc: 1n } }), "value"],
    ["the empty unit", ownWith({ value: { lovelace: 1n, "": 1n } }), "value"],
    [
      "an asset name above 32 bytes",
      ownWith({ value: { lovelace: 1n, [unitA + "00".repeat(33)]: 1n } }),
      "value",
    ],
    ["a value as a list", ownWith({ value: [] }), "value"],
    ["a Mesh UTxO without an output", { input: ref }, "value"],
    [
      "an amount that is not a list",
      meshWith({ amount: {} as never }),
      "value",
    ],
    [
      "an asset that is not an object",
      meshWith({ amount: [5 as never] }),
      "value",
    ],
    [
      "a quantity that is not digits",
      meshWith({ amount: [{ unit: "lovelace", quantity: "1e6" }] }),
      "value",
    ],
    [
      "a quantity as a number",
      meshWith({ amount: [{ unit: "lovelace", quantity: 1 as never }] }),
      "value",
    ],
    [
      "a Mesh bad unit",
      meshWith({ amount: [{ unit: "ada", quantity: "1" }] }),
      "value",
    ],
    [
      "a dataHash that is not the hash of the plutusData",
      meshWith({ plutusData: "d87980", dataHash: hash(0) }),
      "datum",
    ],
    ["a dataHash that is not a hash", meshWith({ dataHash: "abc" }), "datum"],
    ["plutusData that is not hex", meshWith({ plutusData: "xyz" }), "datum"],
    ["a datum of no known type", ownWith({ datum: { type: "x" } }), "datum"],
    [
      "an inline datum as bare text",
      ownWith({ datum: { type: "inline", data: "d87980" } }),
      "datum",
    ],
    [
      "an inline datum as Mesh data",
      ownWith({
        datum: { type: "inline", data: { type: "Mesh", content: 1 } },
      }),
      "datum",
    ],
    [
      "a hash datum that is not a hash",
      ownWith({ datum: { type: "hash", hash: "ab" } }),
      "datum",
    ],
    [
      "a scriptHash without a scriptRef",
      meshWith({ scriptHash: "ab".repeat(28) }),
      "script",
    ],
    [
      "a scriptHash that is not a hash",
      meshWith({ scriptRef: v3.mesh.output.scriptRef, scriptHash: "ab" }),
      "script",
    ],
    ["a scriptRef that is not hex", meshWith({ scriptRef: "xyz" }), "script"],
    [
      "a Plutus script whose hash is not the script's",
      ownWith({ script: { ...v3.utxo.script, hash: "00".repeat(28) } }),
      "script",
    ],
    [
      "a Plutus script of an unknown version",
      ownWith({ script: { ...v3.utxo.script, version: "V9" } }),
      "script",
    ],
    [
      "a Plutus script whose code is not hex",
      ownWith({ script: { type: "plutus", version: "V3", code: "xyz" } }),
      "script",
    ],
    [
      "a native script that cannot be read",
      ownWith({ script: { type: "native", cbor: "ff" } }),
      "script",
    ],
    [
      "a native script whose hash is not the script's",
      ownWith({
        script: { type: "native", cbor: nativeCbor, hash: "00".repeat(28) },
      }),
      "script",
    ],
    ["a script of no known type", ownWith({ script: { type: "x" } }), "script"],
    [
      "an unknown script that is not hex",
      ownWith({ script: { type: "unknown", scriptRef: "xyz" } }),
      "script",
    ],
    [
      "a Mesh quantity of lovelace above 2^64 - 1",
      meshWith({
        amount: [{ unit: "lovelace", quantity: "18446744073709551616" }],
      }),
      "value",
    ],
    [
      "a Mesh quantity of a token above 2^64 - 1",
      meshWith({
        amount: [{ unit: unitA, quantity: "99999999999999999999999" }],
      }),
      "value",
    ],
    [
      "repeats of lovelace that add up above 2^64 - 1",
      meshWith({
        amount: [
          { unit: "lovelace", quantity: "18446744073709551615" },
          { unit: "", quantity: "18446744073709551615" },
        ],
      }),
      "value",
    ],
    [
      "repeats of a token that add up above 2^64 - 1",
      meshWith({
        amount: [
          { unit: unitA, quantity: "18446744073709551615" },
          { unit: unitA.toUpperCase(), quantity: "1" },
        ],
      }),
      "value",
    ],
    [
      "lovelace above 2^64 - 1",
      ownWith({ value: { lovelace: 2n ** 70n } }),
      "value",
    ],
    [
      "a token above 2^64 - 1",
      ownWith({ value: { lovelace: 1n, [unitA]: 2n ** 64n } }),
      "value",
    ],
    [
      "a token in two cases that adds up above 2^64 - 1",
      ownWith({
        value: {
          lovelace: 1n,
          [unitA]: MAX_QUANTITY,
          [unitA.toUpperCase()]: 1n,
        },
      }),
      "value",
    ],
    [
      "a value whose lovelace is a getter of a class",
      ownWith({
        value: new (class {
          get lovelace() {
            return 7n;
          }
        })(),
      }),
      "value",
    ],
    [
      "a value whose lovelace is not enumerable",
      ownWith({
        value: Object.defineProperty({}, "lovelace", {
          value: 9n,
          enumerable: false,
        }),
      }),
      "value",
    ],
    [
      "a value with an inherited token",
      ownWith({
        value: Object.assign(Object.create({ [unitA]: 5n }), { lovelace: 1n }),
      }),
      "value",
    ],
    [
      "a value with a token that is not enumerable",
      ownWith({
        value: Object.defineProperty({ lovelace: 1n }, unitA, {
          value: 5n,
          enumerable: false,
        }),
      }),
      "value",
    ],
    [
      "a value with a symbol member",
      ownWith({ value: { lovelace: 1n, [Symbol("token")]: 5n } }),
      "value",
    ],
    [
      "an amount with a hole",
      // eslint-disable-next-line no-sparse-arrays
      meshWith({ amount: [, { unit: "lovelace", quantity: "5" }] as never }),
      "value",
    ],
  ])("refuses %s", (_, given, kind) => {
    expect(kindOf(given)).toBe(kind);
  });

  it.each<[string, unknown, string]>([
    [
      "plutusData that is not Plutus data",
      meshWith({ plutusData: "ff" }),
      "ff",
    ],
    [
      "plutusData with bytes after the data",
      meshWith({ plutusData: "d8798000" }),
      "d8798000",
    ],
    [
      "an inline datum of two data items",
      ownWith({
        datum: { type: "inline", data: { type: "CBOR", content: "0102" } },
      }),
      "0102",
    ],
    [
      "CBOR whose inline datum has bytes after the data",
      cborWith(inline.mesh, "d81844d8799fff", "d81845d8799fff00"),
      "d8799fff00",
    ],
  ])(
    "keeps %s as the hex given: an inline datum is not judged",
    (_, given, content) => {
      expect(readUtxo(given).datum).toEqual({
        type: "inline",
        data: { type: "CBOR", content },
      });
    },
  );

  it("toUtxo throws INVALID_OPTION with the type of the given value and the reason as cause", () => {
    const given = meshWith({ scriptHash: "ab".repeat(28) });
    let thrown: unknown;
    try {
      toUtxo(given);
    } catch (error) {
      thrown = error;
    }
    expect(TxBuildError.is(thrown, "INVALID_OPTION")).toBe(true);
    const error = thrown as TxBuildError<"INVALID_OPTION">;
    expect(error.details.option).toBe("utxo");
    // Only the JavaScript type: an address in it may be a key given by mistake
    expect(error.details.value).toBe("object");
    expect(error.details.allowed).toMatch(/Mesh UTxO/);
    expect(error.cause).toBeInstanceOf(UtxoError);
    expect((error.cause as UtxoError).kind).toBe("script");
    expect(error.message).toMatch(/scriptHash without scriptRef/);
  });

  it("toUtxo reads the CBOR of a script of a language the decoder does not know as it reads its Mesh form: the script unknown, as given", () => {
    const cbor = cborWith(
      v3.mesh,
      resolveScriptRef({ code: double, version: "V3" }),
      `8204${double}`,
    );
    const unknown = { type: "unknown", scriptRef: `8204${double}` };
    expect(toUtxo(cbor).script).toEqual(unknown);
    expect(toUtxo(meshWith({ scriptRef: `8204${double}` })).script).toEqual(
      unknown,
    );
  });

  it("toUtxo throws INVALID_OPTION for an amount with a hole", () => {
    // eslint-disable-next-line no-sparse-arrays
    const amount = [, { unit: "lovelace", quantity: "5" }] as never;
    expect(() => toUtxo(meshWith({ amount }))).toThrow(TxBuildError);
  });

  it("toMeshUtxo throws as toUtxo does", () => {
    expect(() => toMeshUtxo("84a400")).toThrow(TxBuildError);
    try {
      toMeshUtxo(ownWith({ address: reward }) as Utxo);
    } catch (error) {
      expect(TxBuildError.is(error, "INVALID_OPTION")).toBe(true);
      expect(((error as TxBuildError).cause as UtxoError).kind).toBe("address");
    }
    expect.assertions(3);
  });
});

describe("Utxo scripts", () => {
  /** A canonical CBOR byte string holding the bytes of `hex` */
  const wrap = (hex: string) => {
    const n = hex.length / 2;
    const head =
      n < 24
        ? (0x40 + n).toString(16)
        : n < 256
          ? `58${n.toString(16).padStart(2, "0")}`
          : `59${n.toString(16).padStart(4, "0")}`;
    return head + hex;
  };
  /** `double` with a length of two bytes, not one, in its inner wrapping */
  const loose = wrap(
    `59${(flat.length / 2).toString(16).padStart(4, "0")}${flat}`,
  );

  it("keeps a code wrapped twice byte for byte and hashes the given bytes", () => {
    expect(loose).not.toBe(double);
    const utxo = toUtxo({
      ...ada.utxo,
      script: { type: "plutus", version: "V3", code: loose },
    } as Utxo);
    expect(utxo.script).toStrictEqual({
      type: "plutus",
      version: "V3",
      code: loose,
      hash: refHash(`8203${loose}`),
    });
    expect(refHash(`8203${loose}`)).not.toBe(v3.utxo.script!.hash);
    // The same from a Mesh UTxO and from CBOR
    const mesh = meshWith({ scriptRef: `8203${loose}` });
    expect(toUtxo(mesh)).toStrictEqual(utxo);
    expect(toUtxo(cborOf(mesh))).toStrictEqual(utxo);
    expect(toMeshUtxo(utxo).output.scriptRef).toBe(`8203${loose}`);
  });

  it("has a program in three distinct forms to read", () => {
    expect(new Set([flat, single, double]).size).toBe(3);
    expect(double).toBe(alwaysSucceedCbor);
  });

  it.each([
    ["flat", flat],
    ["in one wrapping", single],
    ["in two wrappings", double],
    ["in upper case", single.toUpperCase()],
  ])("gives a code %s the hash spend.plutus computes for it", (_, code) => {
    for (const version of ["V1", "V2", "V3"] as const) {
      const utxo = toUtxo({
        ...ada.utxo,
        script: { type: "plutus", version, code },
      } as Utxo);
      const part = spend.plutus({
        utxo: ada.mesh.input,
        script: { code, version },
        redeemer: { data: 0 },
      });
      const source =
        part.witness.type === "plutus" ? part.witness.script : undefined;
      expect(source?.type).toBe("attached");
      expect(utxo.script).toStrictEqual({
        type: "plutus",
        version,
        code: double,
        hash: source?.scriptHash,
      });
    }
  });

  it("fills in a missing hash and keeps a right one", () => {
    const { hash: right, ...noHash } = v3.utxo.script as Extract<
      Utxo["script"],
      { type: "plutus" }
    >;
    expect(
      toUtxo({ ...ada.utxo, script: noHash } as Utxo).script,
    ).toStrictEqual(v3.utxo.script);
    expect(
      toUtxo({
        ...ada.utxo,
        script: { ...v3.utxo.script!, hash: right.toUpperCase() },
      } as Utxo).script,
    ).toStrictEqual(v3.utxo.script);
  });

  describe.each<[string, string, string | undefined]>([
    ["of a language this library does not know", `8204${double}`, undefined],
    ["that is a bare byte string", double, "ab".repeat(28)],
    [
      "whose stated hash is not its hash",
      resolveScriptRef({ code: double, version: "V3" }),
      "00".repeat(28),
    ],
    [
      "with bytes after it",
      `${resolveScriptRef({ code: double, version: "V3" })}00`,
      undefined,
    ],
  ])("a reference script %s", (_, scriptRef, scriptHash) => {
    const mesh = meshWith({
      scriptRef,
      ...(scriptHash !== undefined && { scriptHash }),
    });
    const script = {
      type: "unknown",
      scriptRef,
      ...(scriptHash !== undefined && { hash: scriptHash }),
    };

    it("is carried as unknown", () => {
      expect(toUtxo(mesh).script).toStrictEqual(script);
    });

    it("is written back unchanged", () => {
      const back = toMeshUtxo(mesh);
      expect(back.output.scriptRef).toBe(scriptRef);
      expect(back.output.scriptHash).toBe(scriptHash);
      expect(toUtxo(back)).toStrictEqual(toUtxo(mesh));
    });

    it("stays unknown when read again in the builder's form", () => {
      const utxo = toUtxo(mesh);
      expect(toUtxo(utxo)).toStrictEqual(utxo);
    });
  });

  it("reads an unknown script again: what can be read is described", () => {
    const utxo = toUtxo({
      ...ada.utxo,
      script: { type: "unknown", scriptRef: v3.mesh.output.scriptRef! },
    });
    expect(utxo.script).toStrictEqual(v3.utxo.script);
  });

  it("describeScriptRef, scriptRefOf and scriptSize", () => {
    const scriptRef = v3.mesh.output.scriptRef!;
    expect(describeScriptRef(scriptRef)).toStrictEqual(v3.utxo.script);
    expect(describeScriptRef(scriptRef.toUpperCase())).toStrictEqual(
      v3.utxo.script,
    );
    expect(describeScriptRef(scriptRef, v3.utxo.script!.hash)).toStrictEqual(
      v3.utxo.script,
    );
    expect(describeScriptRef(scriptRef, hash(0).slice(0, 56))).toStrictEqual({
      type: "unknown",
      scriptRef,
      hash: hash(0).slice(0, 56),
    });
    expect(() => describeScriptRef("xyz")).toThrow(UtxoError);
    for (const { utxo, mesh } of Object.values(fixtures)) {
      if (!utxo.script) continue;
      expect(scriptRefOf(utxo.script)).toBe(mesh.output.scriptRef);
      expect(scriptSize(utxo.script)).toBe(mesh.output.scriptRef!.length / 2);
    }
    expect(scriptSize({ type: "unknown", scriptRef: "8204aabb" })).toBe(4);
  });
});

describe("toMeshUtxo", () => {
  const full: Utxo = {
    txHash: hash(0x10),
    outputIndex: 7,
    address,
    value: { lovelace: 4_000_000n, [unitA]: 2n, [unitB]: 3n },
    datum: inline.utxo.datum!,
    script: v3.utxo.script!,
  };

  it("writes every member", () => {
    expect(toMeshUtxo(full)).toStrictEqual({
      input: { txHash: hash(0x10), outputIndex: 7 },
      output: {
        address,
        amount: [
          { unit: "lovelace", quantity: "4000000" },
          { unit: unitA, quantity: "2" },
          { unit: unitB, quantity: "3" },
        ],
        dataHash: resolveDataHash("d8799fff", "CBOR"),
        plutusData: "d8799fff",
        scriptRef: v3.mesh.output.scriptRef,
        scriptHash: v3.utxo.script!.hash,
      },
    });
    expect(toMeshUtxo(fixtures["a datum hash"]!.utxo).output).toStrictEqual({
      address,
      amount: [{ unit: "lovelace", quantity: "3000000" }],
      dataHash: hash(0xab),
    });
    expect(
      toMeshUtxo({ ...ada.utxo, value: { lovelace: 0n } }).output.amount,
    ).toEqual([{ unit: "lovelace", quantity: "0" }]);
  });

  it("writes a reference script as resolveScriptRef does", () => {
    expect(toMeshUtxo(v3.utxo).output.scriptRef).toBe(
      resolveScriptRef({ code: double, version: "V3" }),
    );
    expect(
      toMeshUtxo(fixtures["a native reference script"]!.utxo).output.scriptRef,
    ).toBe(resolveScriptRef(nativeScript));
  });

  it("round trips both ways", () => {
    expect(toUtxo(toMeshUtxo(full))).toStrictEqual(full);
    const mesh = toMeshUtxo(full);
    expect(toMeshUtxo(toUtxo(mesh))).toStrictEqual(mesh);
    expect(toMeshUtxo(toMeshUtxo(full))).toStrictEqual(mesh);
  });

  it("gives an evaluator the bytes of the source CBOR", () => {
    const cbor = toTxUnspentOutput(toMeshUtxo(full)).toCbor().toString();
    expect(toUtxo(cbor)).toStrictEqual(full);
    expect(
      toTxUnspentOutput(toMeshUtxo(toUtxo(cbor)))
        .toCbor()
        .toString(),
    ).toBe(cbor);
  });
});

describe("Utxo helpers", () => {
  it("readOutRef reads the out ref of every form", () => {
    const expected = { txHash: hash(2), outputIndex: 1 };
    const { utxo, mesh } = fixtures["tokens listed out of order"]!;
    expect(readOutRef(utxo)).toStrictEqual(expected);
    expect(readOutRef(mesh)).toStrictEqual(expected);
    expect(readOutRef(cborOf(mesh))).toStrictEqual(expected);
    expect(
      readOutRef({ txHash: hash(2).toUpperCase(), outputIndex: 1 }),
    ).toStrictEqual(expected);
    // Only the out ref is read
    expect(
      readOutRef({ input: mesh.input, output: { amount: "x" } }),
    ).toStrictEqual(expected);
    for (const bad of [
      null,
      "84a400",
      { txHash: "ab", outputIndex: 0 },
      { txHash: hash(1), outputIndex: 70000 },
      { input: 5 },
    ]) {
      expect(() => readOutRef(bad)).toThrow(UtxoError);
    }
  });

  it("outRefOf has exactly the two members of an out ref", () => {
    const built = { ...full(), label: "pay", change: true };
    expect(Object.keys(outRefOf(built))).toEqual(["txHash", "outputIndex"]);
    expect(outRefOf(built)).toStrictEqual({ txHash: hash(3), outputIndex: 2 });
  });

  it("utxoKey writes an out ref as txHash#index", () => {
    expect(utxoKey({ txHash: hash(1), outputIndex: 4 })).toBe(`${hash(1)}#4`);
    expect(utxoKey(inline.utxo)).toBe(`${hash(3)}#2`);
  });

  it("plainUtxo copies a UTxO without the marks of a built output", () => {
    const built = { ...full(), label: "pay", change: true as const };
    const plain = plainUtxo(built);
    expect(plain).toStrictEqual(full());
    expect(plain.value).not.toBe(built.value);
    expect(plain.datum).not.toBe(built.datum);
    expect(plainUtxo(ada.utxo)).toStrictEqual(ada.utxo);
    expect(Object.keys(plainUtxo(ada.utxo))).toEqual(Object.keys(ada.utxo));
  });

  function full(): Utxo {
    return { ...inline.utxo, script: v3.utxo.script! };
  }
});

describe("outputAsUtxo", () => {
  const addressHex = Address.fromBech32(address).toBytes().toString();
  /** An output as a map, with an inline datum and a reference script, in these bytes */
  const outputOf = (datum: string, scriptRef: string, at = addressHex) =>
    TransactionOutput.fromCbor(
      HexBlob(
        cbor.map(
          [cbor.uint(0), cbor.bytes(at)],
          [cbor.uint(1), cbor.uint(2_000_000)],
          [cbor.uint(2), cbor.arr(cbor.uint(1), `d818${cbor.bytes(datum)}`)],
          [cbor.uint(3), `d818${cbor.bytes(scriptRef)}`],
        ),
      ),
    );
  const nativeRef = `8200${nativeCbor}`;
  const plutusRefBytes = `8203${cbor.bytes(single)}`;

  it("gives an output of a decoded transaction with its inline datum and its reference script byte for byte", () => {
    const datums = [
      cbor.constr0(cbor.uint(1), cbor.bytes("cafe")),
      cbor.constr0Indef(cbor.uint(1), cbor.bytes("cafe")),
      cbor.constr0(cbor.uint64(1), cbor.bytes("cafe")),
      cbor.constr0(cbor.uint(1), cbor.chunkedBytes("cafe")),
    ];
    for (const datum of datums)
      for (const scriptRef of [nativeRef, plutusRefBytes]) {
        const utxo = outputAsUtxo(hash(7), 3, outputOf(datum, scriptRef));
        expect(utxo).toEqual(readUtxo(utxo));
        expect(utxo.txHash).toBe(hash(7));
        expect(utxo.outputIndex).toBe(3);
        expect(utxo.address).toBe(address);
        expect(utxo.value).toEqual({ lovelace: 2_000_000n });
        expect(utxo.datum).toEqual({
          type: "inline",
          data: { type: "CBOR", content: datum },
        });
        expect(scriptRefOf(utxo.script!)).toBe(scriptRef);
        expect(utxo.script!.hash).toBe(refHash(scriptRef));
      }
  });

  it("refuses what a Utxo cannot hold", () => {
    const datum = cbor.constr0(cbor.uint(1));
    const kind = (run: () => unknown) => {
      try {
        run();
        return "accepted";
      } catch (error) {
        if (error instanceof UtxoError) return error.kind;
        throw error;
      }
    };
    const rewardHex = Address.fromBech32(reward).toBytes().toString();
    expect(
      kind(() =>
        outputAsUtxo(hash(7), 0, outputOf(datum, nativeRef, rewardHex)),
      ),
    ).toBe("address");
    const good = outputOf(datum, nativeRef);
    expect(kind(() => outputAsUtxo("zz", 0, good))).toBe("outRef");
    expect(kind(() => outputAsUtxo(hash(7), 65536, good))).toBe("outRef");
    expect(kind(() => outputAsUtxo(hash(7), 65535, good))).toBe("accepted");
  });
});

describe("the data and the reference script of a UTxO, read without being decoded", () => {
  const addressHex = Address.fromBech32(address).toBytes().toString();
  /** A list nested `depth` deep around a list of `width` zeros */
  const deep = (depth: number, width = 0) =>
    "81".repeat(depth) + cbor.head(4, width) + "00".repeat(width);
  /** `all` around a key `levels` times: two levels of nesting each, one for the key's own list */
  const nested = (levels: number) =>
    "820181".repeat(levels) + `8200581c${keyHashHex(1)}`;
  /** The CBOR of a transaction unspent output with these members, written by hand */
  const utxoCbor = (members: { datum?: string; scriptRef?: string }) =>
    cbor.arr(
      cbor.arr(cbor.bytes(hash(5)), cbor.uint(1)),
      cbor.map(
        [cbor.uint(0), cbor.bytes(addressHex)],
        [cbor.uint(1), cbor.uint(5_000_000)],
        ...(members.datum === undefined
          ? []
          : [
              [
                cbor.uint(2),
                cbor.arr(cbor.uint(1), `d818${cbor.bytes(members.datum)}`),
              ] as [string, string],
            ]),
        ...(members.scriptRef === undefined
          ? []
          : [
              [cbor.uint(3), `d818${cbor.bytes(members.scriptRef)}`] as [
                string,
                string,
              ],
            ]),
      ),
    );
  /** The same inline datum in each form a UTxO is given in */
  const withDatum = (datum: string): [string, unknown][] => [
    [
      "a Utxo",
      ownWith({
        datum: { type: "inline", data: { type: "CBOR", content: datum } },
      }),
    ],
    [
      "a Mesh UTxO",
      meshWith({ plutusData: datum, dataHash: cbor.blake(datum, 32) }),
    ],
    ["its CBOR", utxoCbor({ datum })],
  ];
  /** The same reference script in each form a UTxO is given in */
  const withScript = (scriptRef: string): [string, unknown][] => [
    [
      "a Utxo",
      ownWith({ script: { type: "native", cbor: scriptRef.slice(4) } }),
    ],
    ["a Mesh UTxO", meshWith({ scriptRef })],
    ["its CBOR", utxoCbor({ scriptRef })],
  ];
  const timed = (run: () => unknown) => {
    const start = performance.now();
    let thrown: unknown;
    try {
      run();
    } catch (error) {
      thrown = error;
    }
    return { thrown, ms: performance.now() - start };
  };

  it("reads an inline datum nested 4 000 deep, or 120 deep around 15 000 zeros, in each form, byte for byte and at once", () => {
    for (const datum of [deep(4_000), deep(2_000), deep(120, 15_000)])
      for (const [form, given] of withDatum(datum)) {
        let utxo: Utxo | undefined;
        const { thrown, ms } = timed(() => (utxo = readUtxo(given)));
        expect([form, thrown]).toEqual([form, undefined]);
        // Milliseconds: decoded, such data took seconds, and 4 000 levels exhausted the stack
        expect(ms).toBeLessThan(500);
        expect(utxo!.datum).toEqual({
          type: "inline",
          data: { type: "CBOR", content: datum },
        });
        // The hash of a datum is the hash of its bytes
        expect(toMeshUtxo(utxo!).output.dataHash).toBe(cbor.blake(datum, 32));
      }
  });

  it("takes a Mesh UTxO's dataHash as the hash of the bytes of its plutusData, whatever their form", () => {
    for (const datum of ["d8799fff", "d87980", cbor.constr0(cbor.uint64(1))]) {
      expect(
        kindOf(
          meshWith({ plutusData: datum, dataHash: cbor.blake(datum, 32) }),
        ),
      ).toBe("accepted");
      expect(
        kindOf(
          meshWith({
            plutusData: datum,
            dataHash: cbor.blake(`${datum}`.replace(/^d879/, "d87a"), 32),
          }),
        ),
      ).toBe("datum");
    }
  });

  it.each<[string, string]>([
    ["a text", "6161"],
    ["a simple value", "f6"],
    ["a float", "f93c00"],
    ["the tag of encoded CBOR", "d8184100"],
    ["a constructor tag on a map", "d879a0"],
    ["a big-integer tag on an integer", "c201"],
    ["a text inside a list", cbor.arr(cbor.uint(1), "6161")],
    ["bytes that are not CBOR", "ff"],
    ["a list that does not end", "9f01"],
    ["bytes after the data", "d879800000"],
  ])(
    "keeps as an inline datum %s in each form, the hex given, never decoded",
    (_, datum) => {
      for (const [form, given] of withDatum(datum))
        expect([form, readUtxo(given).datum]).toEqual([
          form,
          { type: "inline", data: { type: "CBOR", content: datum } },
        ]);
    },
  );

  /** `all` of `count` native scripts, each `nested(levels)`: as `[0, native]` */
  const allOf = (count: number, levels: number) =>
    `8200${`8201${cbor.head(4, count)}${nested(levels).repeat(count)}`}`;
  /** `all` of `count` keys, as `[0, native]` */
  const keys = (count: number) =>
    `8200${`8201${cbor.head(4, count)}${Array.from(
      { length: count },
      (_, i) => `8200581c${i.toString(16).padStart(56, "0")}`,
    ).join("")}`}`;

  it("holds a reference script past the bounds of its decoding as given, never decoded, in each form at once: 15 KB of an all of 10 native scripts nested 500 deep, one nested 34 deep, of 190 keys, and one nested 5 000 deep", () => {
    for (const scriptRef of [
      allOf(10, 500),
      `8200${nested(34)}`,
      keys(190),
      `8200${nested(5_000)}`,
    ])
      for (const [form, given] of withScript(scriptRef)) {
        const { thrown, ms } = timed(() => readUtxo(given));
        expect([form, thrown]).toEqual([form, undefined]);
        expect(ms).toBeLessThan(500);
        expect([form, readUtxo(given).script]).toEqual([
          form,
          { type: "unknown", scriptRef },
        ]);
      }
    // The hash stated for it is kept, in each form that states one
    const scriptRef = allOf(10, 500);
    const stated = "ab".repeat(28);
    for (const given of [
      meshWith({ scriptRef, scriptHash: stated }),
      ownWith({ script: { type: "unknown", scriptRef, hash: stated } }),
      ownWith({
        script: { type: "native", cbor: scriptRef.slice(4), hash: stated },
      }),
    ]) {
      const { ms } = timed(() => readUtxo(given));
      expect(ms).toBeLessThan(500);
      expect(readUtxo(given).script).toEqual({
        type: "unknown",
        scriptRef,
        hash: stated,
      });
      expect(toMeshUtxo(given as UtxoInput).output).toMatchObject({
        scriptRef,
        scriptHash: stated,
      });
    }
  });

  it("decodes and describes a reference script just within the bounds: native scripts nested 33 deep, and of 189 keys", () => {
    for (const scriptRef of [`8200${nested(33)}`, keys(189)])
      for (const [form, given] of withScript(scriptRef)) {
        const utxo = readUtxo(given);
        expect([form, utxo.script!.type]).toEqual([form, "native"]);
        expect(utxo.script!.hash).toBe(refHash(scriptRef));
        expect(scriptRefOf(utxo.script!)).toBe(scriptRef);
      }
  });

  it("refuses a UTxO whose address is longer than 256 bytes before its base58 is read, its out ref named, in each form: a Byron address of 1 KB, of 257 bytes, and in CBOR of 15 KB; reads one of 256", () => {
    const inCbor = (raw: string) =>
      cbor.arr(
        cbor.arr(cbor.bytes(hash(5)), cbor.uint(1)),
        cbor.map(
          [cbor.uint(0), cbor.bytes(raw)],
          [cbor.uint(1), cbor.uint(5_000_000)],
        ),
      );
    const formsAt = (raw: string): [string, unknown][] => {
      const text = Address.fromBytes(HexBlob(raw)).toBase58();
      return [
        ["a Utxo", ownWith({ address: text })],
        ["a Mesh UTxO", meshWith({ address: text })],
        ["its CBOR", inCbor(raw)],
      ];
    };
    for (const [form, given] of [
      ...formsAt(cbor.byronAddress(980)),
      ...formsAt(cbor.byronAddress(206)),
      ["its CBOR", inCbor(cbor.byronAddress(15_000))] as [string, unknown],
      // Text of base58 too long for any address, never parsed
      ["a Mesh UTxO", meshWith({ address: `D${"z".repeat(20_000)}` })],
    ]) {
      const { thrown, ms } = timed(() => readUtxo(given));
      expect(ms).toBeLessThan(200);
      expect([form, (thrown as UtxoError).kind]).toEqual([form, "address"]);
      expect((thrown as Error).message).toMatch(
        /^the UTxO [0-9a-f]{64}#[01]: its address is longer than the 256 bytes this library reads$/,
      );
    }
    const raw = cbor.byronAddress(205);
    for (const [form, given] of formsAt(raw))
      expect([form, readUtxo(given).address]).toEqual([
        form,
        Address.fromBytes(HexBlob(raw)).toBase58(),
      ]);
  });

  it("reads a UTxO in CBOR that writes its datum twice as the decoder reads it, the last: an inline datum then a hash, a hash then an inline datum, two inline datums", () => {
    const datumHash = "ee".repeat(32);
    const twice = (...entries: string[]) =>
      cbor.arr(
        cbor.arr(cbor.bytes(hash(5)), cbor.uint(1)),
        cbor.map(
          [cbor.uint(0), cbor.bytes(addressHex)],
          [cbor.uint(1), cbor.uint(5_000_000)],
          ...entries.map((entry) => [cbor.uint(2), entry] as [string, string]),
        ),
      );
    const inlineOf = (data: string) =>
      cbor.arr(cbor.uint(1), `d818${cbor.bytes(data)}`);
    const hashOf = cbor.arr(cbor.uint(0), cbor.bytes(datumHash));
    const inline = (data: string) => ({
      type: "inline",
      data: { type: "CBOR", content: data },
    });
    for (const [entries, datum] of [
      [[inlineOf("01"), hashOf], { type: "hash", hash: datumHash }],
      [[hashOf, inlineOf("01")], inline("01")],
      [[inlineOf("01"), inlineOf("02")], inline("02")],
    ] as const) {
      const given = twice(...entries);
      const decoded = TransactionUnspentOutput.fromCbor(HexBlob(given))
        .output()
        .datum()!;
      expect(
        decoded.asInlineData()
          ? inline(decoded.asInlineData()!.toCbor())
          : { type: "hash", hash: decoded.asDataHash() },
      ).toEqual(datum);
      expect(readUtxo(given).datum).toEqual(datum);
    }
  });

  it("reads a UTxO in CBOR that writes its reference script twice as the decoder reads it, the last, and no decoder meets either past the bounds: a script nested 3 000 deep, then a shallow one, and the other way round", () => {
    const shallow = `8200${nested(1)}`;
    const deepOne = `8200${nested(3_000)}`;
    const twice = (first: string, second: string) =>
      cbor.arr(
        cbor.arr(cbor.bytes(hash(5)), cbor.uint(1)),
        cbor.map(
          [cbor.uint(0), cbor.bytes(addressHex)],
          [cbor.uint(1), cbor.uint(5_000_000)],
          [cbor.uint(3), `d818${cbor.bytes(first)}`],
          [cbor.uint(3), `d818${cbor.bytes(second)}`],
        ),
      );
    const { thrown, ms } = timed(() => readUtxo(twice(deepOne, shallow)));
    expect(thrown).toBeUndefined();
    expect(ms).toBeLessThan(500);
    expect(readUtxo(twice(deepOne, shallow)).script).toMatchObject({
      type: "native",
      hash: refHash(shallow),
    });
    const other = timed(() => readUtxo(twice(shallow, deepOne)));
    expect(other.thrown).toBeUndefined();
    expect(other.ms).toBeLessThan(500);
    expect(readUtxo(twice(shallow, deepOne)).script).toEqual({
      type: "unknown",
      scriptRef: deepOne,
    });
  });
});

describe("value of a Utxo", () => {
  it("valueOf and toAssets convert between Assets and Value", () => {
    const assets = { lovelace: 5n, [unitA]: 2n, [unitB]: 1n };
    const value = valueOf(assets);
    expect(value.coin).toBe(5n);
    expect([...value.assets]).toEqual([
      [unitA, 2n],
      [unitB, 1n],
    ]);
    expect(toAssets(value)).toStrictEqual(assets);
    expect(valueOf({ lovelace: 0n, [unitA]: 0n }).assets.size).toBe(0);
    const sorted = toAssets({
      coin: 1n,
      assets: new Map([
        [unitB, 1n],
        [unitA, 3n],
        ["01".repeat(28), 0n],
      ]),
    });
    expect(Object.keys(sorted)).toEqual(["lovelace", unitA, unitB]);
  });
});

/** Checked by the compiler only: how the types fit the parts and the Mesh form */
export const typeCases = (utxo: Utxo, mesh: UTxO) => {
  // A Utxo is an out ref
  const ref: OutRef = utxo;
  // Its value and datum go into an output as they are
  const value: ValueInput = utxo.value;
  const datum: OutputDatumInput | undefined = utxo.datum;
  output({ address: utxo.address, value: utxo.value, datum: utxo.datum });
  // A Plutus script goes into a part as it is; a native one as its CBOR
  if (utxo.script?.type === "plutus") {
    const plutus: PlutusScript = utxo.script;
    const input: PlutusScriptInput = utxo.script;
    output({
      address: utxo.address,
      value: utxo.value,
      scriptRef: utxo.script,
    });
    void [plutus, input];
  }
  if (utxo.script?.type === "native") {
    const native: NativeScriptInput = utxo.script.cbor;
    // @ts-expect-error: a native OutputScript is not a Mesh NativeScript
    const notMesh: NativeScript = utxo.script;
    void [native, notMesh];
  }
  // lovelace is always there; a token may be absent
  const lovelace: bigint = utxo.value.lovelace;
  const token: bigint | undefined = utxo.value[unitA];
  // @ts-expect-error: a value without lovelace is not a UTxO's value
  const noLovelace: Utxo = { ...utxo, value: { [unitA]: 1n } };
  // @ts-expect-error: a Mesh UTxO is not a Utxo
  const fromMesh: Utxo = mesh;
  // @ts-expect-error: a Utxo is not a Mesh UTxO
  const toMesh: UTxO = utxo;
  // Every form is an input
  const inputs: UtxoInput[] = [utxo, mesh, "84a400"];
  const datumOut: OutputDatum = { type: "hash", hash: hash(1) };
  void [ref, value, datum, lovelace, token, noLovelace, fromMesh, toMesh];
  void [inputs, datumOut];
};
