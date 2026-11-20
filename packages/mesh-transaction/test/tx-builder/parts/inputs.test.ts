import {
  mConStr0,
  NativeScript,
  resolveDataHash,
  resolveNativeScriptAddress,
  resolveNativeScriptHash,
  resolveNativeScriptHex,
  resolveScriptRef,
  UTxO,
} from "@meshsdk/core";
import { resolvePlutusScriptAddress, toNativeScript } from "@meshsdk/core-cst";

import {
  collateral,
  collateralReturn,
  OutputDatum,
  OutputScript,
  referenceInput,
  spend,
  TxPartError,
  unresolved,
  Utxo,
  UtxoInput,
} from "../../../src/tx-builder";
import {
  alwaysSucceedCbor,
  alwaysSucceedHash,
  baseAddress,
  rewardAddress,
} from "../../test-util";
import { asCbor, asMesh } from "../utxo-util";

const keyAddress = baseAddress(1);
const plutusAddress = resolvePlutusScriptAddress(
  { code: alwaysSucceedCbor, version: "V3" },
  0,
);
const nativeScript: NativeScript = { type: "all", scripts: [] };
const nativeAddress = resolveNativeScriptAddress(nativeScript, 0);
const unitDatum = mConStr0([]);
const unitDatumHash = resolveDataHash(unitDatum);
const unitDatumCbor = "d87980";
const unitInline: OutputDatum = {
  type: "inline",
  data: { type: "CBOR", content: unitDatumCbor },
};
const nativeRef: OutputScript = {
  type: "native",
  cbor: toNativeScript(nativeScript).toCbor().toString(),
  hash: resolveNativeScriptHash(nativeScript),
};
const plutusRef: OutputScript = {
  type: "plutus",
  version: "V3",
  code: alwaysSucceedCbor,
  hash: alwaysSucceedHash,
};

const utxo = (
  outputIndex: number,
  address: string,
  extra: Partial<Utxo> = {},
): Utxo => ({
  txHash: "a".repeat(64),
  outputIndex,
  address,
  value: { lovelace: 5_000_000n },
  ...extra,
});
const outRef = { txHash: "b".repeat(64), outputIndex: 3 };
const input = { transaction_id: "b".repeat(64), index: 3 };

const expectPartError = (build: () => unknown, code: string) => {
  try {
    build();
  } catch (error) {
    expect(error).toBeInstanceOf(TxPartError);
    expect((error as TxPartError).code).toBe(code);
    return error as TxPartError;
  }
  throw new Error(`expected a ${code} error`);
};

describe("spend.pubKey", () => {
  it("takes an output by reference, leaving its contents to resolve", () => {
    const part = spend.pubKey({ utxo: outRef });

    expect(part).toEqual({ kind: "spend", input, witness: { type: "key" } });
    expect(unresolved(part)).toEqual([{ type: "utxo", input }]);
  });

  it("takes a full UTxO, needing nothing more", () => {
    const part = spend.pubKey({ utxo: utxo(0, keyAddress), label: "fee" });

    expect(part.utxo?.address).toBe(keyAddress);
    expect(part.label).toBe("fee");
    expect(unresolved(part)).toEqual([]);
  });

  it("is frozen and detached from the caller's UTxO", () => {
    const given = utxo(0, keyAddress);
    const part = spend.pubKey({ utxo: given });
    (given.value as Record<string, bigint>).lovelace = 1n;

    expect(Object.isFrozen(part)).toBe(true);
    expect(Object.isFrozen(part.utxo!.value)).toBe(true);
    expect(part.utxo!.value.lovelace).toBe(5_000_000n);
  });

  it("rejects a script-locked output", () => {
    const error = expectPartError(
      () => spend.pubKey({ utxo: utxo(0, plutusAddress), label: "mine" }),
      "WITNESS_MISMATCH",
    );
    expect(error.part).toBe("spend");
    expect(error.label).toBe("mine");
    expect(error.message).toMatch(/^spend "mine": /);
  });

  it("rejects an impossible output reference", () => {
    expectPartError(
      () => spend.pubKey({ utxo: { txHash: "abc", outputIndex: 0 } }),
      "INVALID_OUT_REF",
    );
    expectPartError(
      () => spend.pubKey({ utxo: { txHash: "b".repeat(64), outputIndex: -1 } }),
      "INVALID_OUT_REF",
    );
    expectPartError(
      () =>
        spend.pubKey({ utxo: { txHash: "b".repeat(64), outputIndex: 65536 } }),
      "INVALID_OUT_REF",
    );
  });

  it("rejects a UTxO with an invalid address", () => {
    expectPartError(
      () => spend.pubKey({ utxo: utxo(0, "addr_test1nope") }),
      "INVALID_ADDRESS",
    );
  });

  it("rejects a UTxO whose amount is not a list of assets", () => {
    const amounts: unknown[] = [
      [{ unit: "lovelace", quantity: "abc" }],
      [{ unit: "lovelace", quantity: "0x10" }],
      [{ unit: "lovelace", quantity: "-5" }],
      [{ unit: "lovelace", quantity: 5 }],
      [{ unit: "zz", quantity: "1" }],
      [null],
      "5000000",
    ];
    for (const amount of amounts) {
      const given = asMesh(utxo(0, keyAddress));
      const error = expectPartError(
        () =>
          spend.pubKey({
            utxo: { ...given, output: { ...given.output, amount } } as UTxO,
            label: "mine",
          }),
        "INVALID_VALUE",
      );
      expect(error).toMatchObject({ part: "spend", label: "mine" });
      expect(error.message).toContain(`${"a".repeat(64)}#0`);
    }
    // The same check for every part that takes a UTxO in full
    const bad = {
      ...asMesh(utxo(0, keyAddress)),
      output: {
        address: keyAddress,
        amount: [{ unit: "lovelace", quantity: "abc" }],
      },
    };
    expectPartError(() => referenceInput({ utxo: bad }), "INVALID_VALUE");
    expectPartError(() => collateral({ utxo: bad }), "INVALID_VALUE");
  });

  it("rejects an input that is neither an out ref nor a UTxO", () => {
    for (const given of [null, 5, "ab", { input: null }])
      expectPartError(
        () => spend.pubKey({ utxo: given as never }),
        "INVALID_OUT_REF",
      );
    expectPartError(
      () =>
        spend.pubKey({
          utxo: { input: outRef, output: null } as never,
        }),
      "INVALID_VALUE",
    );
  });
});

describe("a UTxO given to a part", () => {
  const given = utxo(1, plutusAddress, {
    value: { [`${"cd".repeat(28)}01`]: 2n, lovelace: 5_000_000n },
    datum: unitInline,
  });
  const forms: [string, UtxoInput][] = [
    ["a Utxo", given],
    ["a Mesh UTxO", asMesh(given)],
    ["its CBOR", asCbor(given)],
  ];

  it("is stored as the same Utxo, whatever form it is given in", () => {
    const stored = forms.map(([, form]) => referenceInput({ utxo: form }).utxo);
    expect(stored[0]).toStrictEqual({
      txHash: "a".repeat(64),
      outputIndex: 1,
      address: plutusAddress,
      value: { lovelace: 5_000_000n, [`${"cd".repeat(28)}01`]: 2n },
      datum: { type: "inline", data: { type: "CBOR", content: unitDatumCbor } },
    });
    for (const utxo of stored) expect(utxo).toStrictEqual(stored[0]);
    const unlock = (form: UtxoInput) =>
      spend.plutus({
        utxo: form,
        script: { code: alwaysSucceedCbor, version: "V3" },
        redeemer: { data: unitDatum },
      });
    for (const [, form] of forms)
      expect(unlock(form)).toStrictEqual(unlock(forms[0]![1]));
  });

  it("is not looked up when given in full; its out ref alone is", () => {
    const owned = utxo(2, keyAddress);
    for (const form of [owned, asMesh(owned), asCbor(owned)])
      expect(unresolved(spend.pubKey({ utxo: form }))).toEqual([]);
    const byRef = spend.pubKey({
      utxo: { txHash: "a".repeat(64), outputIndex: 2 },
    });
    expect(byRef.utxo).toBeUndefined();
    expect(unresolved(byRef)).toEqual([
      { type: "utxo", input: { transaction_id: "a".repeat(64), index: 2 } },
    ]);
    // The out ref of a Utxo, its other members dropped, is a reference again
    const { address, value, ...bare } = owned;
    expect(address && value).toBeTruthy();
    expect(unresolved(spend.pubKey({ utxo: bare }))).toEqual(unresolved(byRef));
  });

  it("is INVALID_VALUE as an object with an address and no value", () => {
    const error = expectPartError(
      () =>
        spend.pubKey({
          utxo: { txHash: "a".repeat(64), outputIndex: 0, address: keyAddress },
        } as never),
      "INVALID_VALUE",
    );
    expect(error.message).toContain(`${"a".repeat(64)}#0`);
  });

  it("is refused when it cannot be held as a Utxo, with the code of the member at fault", () => {
    const own = utxo(0, keyAddress);
    const mesh = asMesh(own);
    const cases: [string, unknown, string][] = [
      [
        "a Mesh UTxO whose dataHash is not the hash of its plutusData",
        {
          ...mesh,
          output: {
            ...mesh.output,
            plutusData: unitDatumCbor,
            dataHash: "ab".repeat(32),
          },
        },
        "INVALID_DATA",
      ],
      [
        "a Mesh UTxO stating a script hash without its script",
        {
          ...mesh,
          output: { ...mesh.output, scriptHash: alwaysSucceedHash },
        },
        "INVALID_SCRIPT",
      ],
      [
        "a Utxo whose script hash is not its script's",
        {
          ...own,
          script: {
            type: "plutus",
            version: "V3",
            code: alwaysSucceedCbor,
            hash: "ab".repeat(28),
          },
        },
        "INVALID_SCRIPT",
      ],
      [
        "a Utxo with a value without lovelace",
        { ...own, value: { [`${"cd".repeat(28)}01`]: 1n } },
        "INVALID_VALUE",
      ],
      [
        "a Utxo at a reward address",
        { ...own, address: rewardAddress(1) },
        "INVALID_ADDRESS",
      ],
      ["text that is not CBOR", "8200", "INVALID_OUT_REF"],
      [
        "an object with the members of both forms",
        { ...mesh, txHash: "a".repeat(64), outputIndex: 0 },
        "INVALID_OUT_REF",
      ],
    ];
    for (const [, utxo, code] of cases) {
      const error = expectPartError(
        () => spend.pubKey({ utxo: utxo as never, label: "given" }),
        code,
      );
      expect(error).toMatchObject({ part: "spend", label: "given" });
      expect(error.cause).toBeInstanceOf(Error);
    }
  });
});

describe("spend.native", () => {
  it("attaches a native script given as a script or as CBOR", () => {
    const fromScript = spend.native({
      utxo: utxo(0, nativeAddress),
      script: nativeScript,
    });
    const fromCbor = spend.native({
      utxo: utxo(0, nativeAddress),
      script: resolveNativeScriptHex(nativeScript),
    });

    expect(fromScript.witness).toEqual({
      type: "native",
      script: {
        type: "attached",
        script: { type: "SCRIPT_ALL", value: { native_scripts: [] } },
        cbor: resolveNativeScriptHex(nativeScript),
        scriptHash: resolveNativeScriptHash(nativeScript),
      },
    });
    expect(fromCbor.witness).toEqual(fromScript.witness);
  });

  it("rejects a script that does not lock the output", () => {
    expectPartError(
      () =>
        spend.native({
          utxo: utxo(0, nativeAddress),
          script: { type: "sig", keyHash: "c".repeat(56) },
        }),
      "WITNESS_MISMATCH",
    );
    expectPartError(
      () => spend.native({ utxo: utxo(0, keyAddress), script: nativeScript }),
      "WITNESS_MISMATCH",
    );
  });

  it("reads a reference script from a full reference UTxO", () => {
    const scriptRef = resolveScriptRef(nativeScript);
    const part = spend.native({
      utxo: utxo(0, nativeAddress),
      script: { reference: utxo(1, keyAddress, { script: nativeRef }) },
    });

    expect(part.witness).toMatchObject({
      type: "native",
      script: {
        type: "reference",
        input: { transaction_id: "a".repeat(64), index: 1 },
        scriptHash: resolveNativeScriptHash(nativeScript),
        scriptSize: scriptRef.length / 2,
      },
    });
    expect(unresolved(part)).toEqual([]);
  });

  it("leaves a script referenced by out ref only to resolve", () => {
    const part = spend.native({
      utxo: outRef,
      script: { reference: { txHash: "c".repeat(64), outputIndex: 0 } },
    });

    expect(unresolved(part)).toEqual([
      { type: "utxo", input },
      {
        type: "scriptReference",
        input: { transaction_id: "c".repeat(64), index: 0 },
      },
    ]);
  });

  it("rejects a reference output holding a Plutus script", () => {
    expectPartError(
      () =>
        spend.native({
          utxo: outRef,
          script: {
            reference: utxo(1, keyAddress, { script: plutusRef }),
          },
        }),
      "INVALID_SCRIPT",
    );
  });
});

describe("spend.plutus", () => {
  const script = { code: alwaysSucceedCbor, version: "V3" as const };
  const redeemer = { data: unitDatum };

  it("attaches a script and works out an inline datum from the UTxO", () => {
    const part = spend.plutus({
      utxo: utxo(0, plutusAddress, { datum: unitInline }),
      script,
      redeemer: { data: unitDatum, exUnits: { mem: 1000, steps: 2000 } },
      label: "unlock",
    });

    expect(part.witness).toEqual({
      type: "plutus",
      script: {
        type: "attached",
        version: "V3",
        cbor: expect.any(String),
        scriptHash: alwaysSucceedHash,
      },
      datum: { type: "inline" },
      redeemer: {
        data: { type: "CBOR", hex: unitDatumCbor },
        exUnits: { mem: "1000", steps: "2000" },
      },
    });
    expect(unresolved(part)).toEqual([]);
  });

  it("leaves datum and execution units to resolve when unknown", () => {
    const part = spend.plutus({ utxo: outRef, script, redeemer });

    expect(unresolved(part)).toEqual([
      { type: "utxo", input },
      { type: "datum", input },
      { type: "exUnits" },
    ]);
  });

  it("accepts redeemer data in any builder format", () => {
    const cbor = spend.plutus({
      utxo: outRef,
      script,
      redeemer: { data: { type: "CBOR", content: unitDatumCbor } },
    });
    const json = spend.plutus({
      utxo: outRef,
      script,
      redeemer: {
        data: { type: "JSON", content: { constructor: 0, fields: [] } },
      },
    });

    expect(cbor.witness).toEqual(json.witness);
  });

  it("checks a supplied datum against the output's datum hash", () => {
    const part = spend.plutus({
      utxo: utxo(0, plutusAddress, {
        datum: { type: "hash", hash: unitDatumHash },
      }),
      script,
      redeemer,
      datum: { data: unitDatum },
    });
    expect(part.witness).toMatchObject({
      datum: {
        type: "provided",
        data: { type: "CBOR", hex: unitDatumCbor },
        hash: unitDatumHash,
      },
    });

    expectPartError(
      () =>
        spend.plutus({
          utxo: utxo(0, plutusAddress, {
            datum: { type: "hash", hash: "d".repeat(64) },
          }),
          script,
          redeemer,
          datum: { data: unitDatum },
        }),
      "DATUM_MISMATCH",
    );
  });

  it("requires the datum of an output holding only its hash", () => {
    expectPartError(
      () =>
        spend.plutus({
          utxo: utxo(0, plutusAddress, {
            datum: { type: "hash", hash: unitDatumHash },
          }),
          script,
          redeemer,
        }),
      "DATUM_MISMATCH",
    );
  });

  it("takes a supplied datum for an output holding its datum inline as a check: the same bytes, in any data format, spend the inline datum; other data, or an output with no datum, is DATUM_MISMATCH naming the out ref", () => {
    const inline = utxo(0, plutusAddress, { datum: unitInline });
    for (const data of [
      unitDatum,
      { type: "CBOR" as const, content: unitDatumCbor },
      { type: "JSON" as const, content: { constructor: 0, fields: [] } },
    ]) {
      const part = spend.plutus({
        utxo: inline,
        script,
        redeemer,
        datum: { data },
      });
      expect(part.witness).toMatchObject({ datum: { type: "inline" } });
    }
    // The same value written otherwise is other bytes: its hash is not the inline datum's
    for (const content of ["d8799fff", "d87a80"]) {
      const error = expectPartError(
        () =>
          spend.plutus({
            utxo: inline,
            script,
            redeemer,
            datum: { data: { type: "CBOR", content } },
          }),
        "DATUM_MISMATCH",
      );
      expect(error.message).toContain(
        `${"a".repeat(64)}#0 holds its datum inline`,
      );
      expect(error.message.includes(content)).toBe(false);
    }
    const error = expectPartError(
      () =>
        spend.plutus({
          utxo: utxo(1, plutusAddress),
          script,
          redeemer,
          datum: { data: unitDatum },
        }),
      "DATUM_MISMATCH",
    );
    expect(error.message).toContain(`${"a".repeat(64)}#1 holds no datum`);
  });

  it("spends an output holding no datum only with Plutus V3", () => {
    const part = spend.plutus({
      utxo: utxo(0, plutusAddress),
      script,
      redeemer,
    });
    expect(part.witness).toMatchObject({ datum: { type: "none" } });

    expectPartError(
      () =>
        spend.plutus({
          utxo: outRef,
          script: { code: alwaysSucceedCbor, version: "V2" },
          redeemer,
          datum: "none",
        }),
      "DATUM_MISMATCH",
    );
  });

  it("takes version, hash and size from a full reference UTxO", () => {
    const scriptRef = resolveScriptRef(script);
    const part = spend.plutus({
      utxo: utxo(0, plutusAddress, { datum: unitInline }),
      script: { reference: utxo(1, keyAddress, { script: plutusRef }) },
      redeemer,
    });

    expect(part.witness).toMatchObject({
      script: {
        type: "reference",
        version: "V3",
        scriptHash: alwaysSucceedHash,
        scriptSize: scriptRef.length / 2,
      },
    });
    expectPartError(
      () =>
        spend.plutus({
          utxo: outRef,
          script: {
            reference: utxo(1, keyAddress, { script: plutusRef }),
            version: "V2",
          },
          redeemer,
        }),
      "INVALID_SCRIPT",
    );
  });

  it("rejects a script that does not lock the output", () => {
    expectPartError(
      () => spend.plutus({ utxo: utxo(0, nativeAddress), script, redeemer }),
      "WITNESS_MISMATCH",
    );
  });

  it("rejects malformed scripts, data and execution units", () => {
    expectPartError(
      () =>
        spend.plutus({
          utxo: outRef,
          script: { code: "zz", version: "V3" },
          redeemer,
        }),
      "INVALID_SCRIPT",
    );
    expectPartError(
      () =>
        spend.plutus({
          utxo: outRef,
          script,
          redeemer: { data: { type: "CBOR", content: "ff" } },
        }),
      "INVALID_DATA",
    );
    expectPartError(
      () =>
        spend.plutus({
          utxo: outRef,
          script,
          redeemer: { data: unitDatum, exUnits: { mem: -1, steps: 0 } },
        }),
      "INVALID_DATA",
    );
  });
});

describe("referenceInput", () => {
  it("references an output by out ref or in full, complete either way", () => {
    expect(unresolved(referenceInput({ utxo: outRef }))).toEqual([]);
    expect(referenceInput({ utxo: outRef }).input).toEqual(input);
    expect(
      unresolved(referenceInput({ utxo: utxo(0, plutusAddress) })),
    ).toEqual([]);
  });
});

describe("collateral", () => {
  it("accepts a key-locked output and rejects a script-locked one", () => {
    expect(collateral({ utxo: utxo(0, keyAddress) }).kind).toBe("collateral");
    expectPartError(
      () => collateral({ utxo: utxo(0, plutusAddress) }),
      "WITNESS_MISMATCH",
    );
  });
});

describe("collateralReturn", () => {
  it("leaves the total to work out unless given", () => {
    expect(unresolved(collateralReturn({ address: keyAddress }))).toEqual([
      { type: "totalCollateral" },
    ]);
    expect(
      collateralReturn({ address: keyAddress, totalCollateral: 5_000_000n }),
    ).toEqual({
      kind: "collateralReturn",
      address: keyAddress,
      totalCollateral: "5000000",
    });
  });

  it("rejects a non-positive total and a bad address", () => {
    expectPartError(
      () => collateralReturn({ address: keyAddress, totalCollateral: 0n }),
      "INVALID_VALUE",
    );
    expectPartError(
      () => collateralReturn({ address: "nope" }),
      "INVALID_ADDRESS",
    );
  });
});
