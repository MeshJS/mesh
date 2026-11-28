import { Cardano, Crypto } from "@meshsdk/core-cst";

import type { OutputScript } from "../../src/tx-builder/parts/types";
import { TxError } from "../../src/tx-builder";
import {
  countedScriptSize,
  describeScriptRef,
  heldScriptSize,
  readUtxo,
  scriptRefOf,
  toMeshUtxo,
  unknownNativeScript,
} from "../../src/tx-builder/parts/utxo";
import { readTransaction, signWitnesses } from "../../src/tx-builder/sign";
import { MAX_TX_BYTES } from "../../src/tx-builder/tx-scan";
import * as cbor from "./cbor-util";

/*
 * The small pieces of CBOR the builder writes and reads itself, each written or read by the
 * writer and the reader of `@cardano-sdk/core`: the bytes are those the CBOR grammar gives, and
 * what is not well formed is refused as before.
 */

const KEY = "5a".repeat(28);
/** A native script naming a key */
const SIG = cbor.arr(cbor.uint(0), cbor.bytes(KEY));
/** `all` of `count` keys: longer than a transaction for 520 */
const keysOf = (count: number) =>
  `8201${cbor.head(4, count)}${Array.from({ length: count }, (_, i) =>
    cbor.arr(cbor.uint(0), cbor.bytes((i + 1).toString(16).padStart(56, "0"))),
  ).join("")}`;
const hashOf = (native: string) => cbor.blake(`00${native}`, 28);
/** A Plutus program in its double CBOR wrapping */
const CODE = cbor.bytes(cbor.bytes("0101003322"));
/** An address of a key, on a test network */
const ADDRESS = Cardano.EnterpriseAddress.fromCredentials(0, {
  type: Cardano.CredentialType.KeyHash,
  hash: "77".repeat(28) as never,
})
  .toAddress()
  .toBech32();

describe("[language, script] written by the SDK writer", () => {
  it("is the array of two items, the language in one byte, and the script as given, for every language", () => {
    const native = describeScriptRef(`8200${SIG}`);
    expect(native).toMatchObject({ type: "native", cbor: SIG });
    expect(scriptRefOf(native)).toBe(`8200${SIG}`);
    for (const [version, tag] of [
      ["V1", "01"],
      ["V2", "02"],
      ["V3", "03"],
    ] as const) {
      const script: OutputScript = {
        type: "plutus",
        version,
        code: CODE,
        hash: cbor.blake(`${tag}${cbor.bytes("0101003322")}`, 28),
      };
      expect(scriptRefOf(script)).toBe(`82${tag}${CODE}`);
      expect(describeScriptRef(`82${tag}${CODE}`)).toEqual(script);
      // A UTxO whose script is given in the builder's form is read back from the same bytes
      const utxo = readUtxo({
        txHash: "11".repeat(32),
        outputIndex: 0,
        address: ADDRESS,
        value: { lovelace: 5_000_000n },
        script: { type: "plutus", version, code: CODE },
      });
      expect(utxo.script).toEqual(script);
      expect(toMeshUtxo(utxo).output.scriptRef).toBe(`82${tag}${CODE}`);
    }
    const fromForm = readUtxo({
      txHash: "11".repeat(32),
      outputIndex: 0,
      address: ADDRESS,
      value: { lovelace: 5_000_000n },
      script: { type: "native", cbor: SIG },
    });
    expect(toMeshUtxo(fromForm).output.scriptRef).toBe(`8200${SIG}`);
  });

  it("counts the code of a Plutus script given in the builder's form as it counts the same in [1, code]", () => {
    const codes = [
      CODE,
      // its head written longer than needed
      `590006${cbor.bytes("0101003322")}`,
      // a byte after it, a string in pieces, not a byte string, a head that states too much
      `${CODE}00`,
      cbor.chunkedBytes(cbor.bytes("0101003322"), 2),
      "00",
      "9f00ff",
      "5a0000ffff00",
      cbor.bytes(""),
    ];
    for (const code of codes) {
      const held = heldScriptSize({
        txHash: "11".repeat(32),
        outputIndex: 0,
        script: { type: "plutus", version: "V3", code },
      });
      expect([code, held?.size]).toEqual([
        code,
        countedScriptSize(`8201${code}`),
      ]);
    }
  });
});

describe("the framing of a native script read by the SDK reader", () => {
  it("reads the break of an array of indefinite length as its last byte, the script before it not read", () => {
    const framed = (scriptRef: string) =>
      unknownNativeScript({ type: "unknown", scriptRef });
    expect(framed(`9f00${SIG}ff`)).toEqual({
      hash: hashOf(SIG),
      reason: "form",
    });
    expect(framed(`d818${cbor.bytes(`9f00${SIG}ff`)}`)).toEqual({
      hash: hashOf(SIG),
      reason: "form",
    });
    // No script, no break, a byte that is not the break: no framing
    for (const scriptRef of [
      "9f00ff",
      `9f00${SIG}`,
      `9f00${SIG}00`,
      `9f00${SIG}f8`,
    ])
      expect([scriptRef, framed(scriptRef)]).toEqual([scriptRef, undefined]);
    // What is before the break is the script, one item or not, as before
    expect(framed(`9f00${SIG}${SIG}ff`)).toEqual({
      hash: hashOf(`${SIG}${SIG}`),
      reason: "form",
    });
    // One longer than a transaction is not read, and is a framing only with its break
    const long = keysOf(520);
    expect(long.length / 2).toBeGreaterThan(MAX_TX_BYTES);
    expect(framed(`9f00${long}ff`)).toEqual({
      hash: hashOf(long),
      reason: "size",
    });
    expect(framed(`9f00${long}00`)).toBeUndefined();
    // In an array of definite length the script is every byte after the language, as before
    expect(framed(`8200${SIG}00`)).toEqual({
      hash: hashOf(`${SIG}00`),
      reason: "form",
    });
    expect(framed("82009f00")).toEqual({
      hash: hashOf("9f00"),
      reason: "form",
    });
  });
});

describe("the SDK writer and reader in signing", () => {
  it("answers an empty witness set when nothing is left to sign, and reads null as no auxiliary data", async () => {
    await Crypto.ready();
    const body = cbor.body("plain", { to: `60${"33".repeat(28)}` });
    const tx = cbor.tx(body, cbor.map(), { aux: "f6" });
    let asked = 0;
    const signer = {
      signTxHash: async () => {
        asked++;
        return [];
      },
    };
    expect(await signWitnesses(signer, tx, [])).toBe("a0");
    expect(asked).toBe(0);
    expect(await signWitnesses({ signTx: async () => "" }, tx)).toBe("a0");
    expect(readTransaction(tx).auxiliaryData).toBeUndefined();
    const withData = cbor.tx(body, cbor.map(), {
      aux: cbor.map([cbor.uint(0), cbor.uint(1)]),
    });
    expect(readTransaction(withData).auxiliaryData).toBeDefined();
    // Null in two bytes is a simple value, read as auxiliary data, and refused
    const error = (() => {
      try {
        readTransaction(cbor.tx(body, cbor.map(), { aux: "f816" }));
      } catch (e) {
        return e;
      }
    })();
    expect(TxError.is(error, "INVALID_OPTION")).toBe(true);
  });
});
