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
import { resolvePlutusScriptAddress } from "@meshsdk/core-cst";

import {
  collateral,
  collateralReturn,
  referenceInput,
  spend,
  TxPartError,
  unresolved,
} from "../../../src/tx-builder";
import {
  alwaysSucceedCbor,
  alwaysSucceedHash,
  baseAddress,
} from "../../test-util";

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

const utxo = (
  outputIndex: number,
  address: string,
  output: Partial<UTxO["output"]> = {},
): UTxO => ({
  input: { txHash: "a".repeat(64), outputIndex },
  output: {
    address,
    amount: [{ unit: "lovelace", quantity: "5000000" }],
    ...output,
  },
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

    expect(part.utxo?.output.address).toBe(keyAddress);
    expect(part.label).toBe("fee");
    expect(unresolved(part)).toEqual([]);
  });

  it("is frozen and detached from the caller's UTxO", () => {
    const given = utxo(0, keyAddress);
    const part = spend.pubKey({ utxo: given });
    given.output.amount[0]!.quantity = "1";

    expect(Object.isFrozen(part)).toBe(true);
    expect(Object.isFrozen(part.utxo!.output.amount[0])).toBe(true);
    expect(part.utxo!.output.amount[0]!.quantity).toBe("5000000");
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
      script: { reference: utxo(1, keyAddress, { scriptRef }) },
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
            reference: utxo(1, keyAddress, {
              scriptRef: resolveScriptRef({
                code: alwaysSucceedCbor,
                version: "V3",
              }),
            }),
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
      utxo: utxo(0, plutusAddress, { plutusData: unitDatumCbor }),
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
      utxo: utxo(0, plutusAddress, { dataHash: unitDatumHash }),
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
          utxo: utxo(0, plutusAddress, { dataHash: "d".repeat(64) }),
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
          utxo: utxo(0, plutusAddress, { dataHash: unitDatumHash }),
          script,
          redeemer,
        }),
      "DATUM_MISMATCH",
    );
  });

  it("rejects a supplied datum for an output holding its datum inline", () => {
    expectPartError(
      () =>
        spend.plutus({
          utxo: utxo(0, plutusAddress, {
            plutusData: unitDatumCbor,
            dataHash: unitDatumHash,
          }),
          script,
          redeemer,
          datum: { data: unitDatum },
        }),
      "DATUM_MISMATCH",
    );
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
      utxo: utxo(0, plutusAddress, { plutusData: unitDatumCbor }),
      script: { reference: utxo(1, keyAddress, { scriptRef }) },
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
            reference: utxo(1, keyAddress, { scriptRef }),
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
  it("references an output by out ref or in full", () => {
    expect(unresolved(referenceInput({ utxo: outRef }))).toEqual([
      { type: "utxo", input },
    ]);
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
