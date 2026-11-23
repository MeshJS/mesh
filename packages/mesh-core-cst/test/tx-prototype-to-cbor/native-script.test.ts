import { Serialization } from "@cardano-sdk/core";
import * as Crypto from "@cardano-sdk/crypto";

import { nativeScriptPrototypeFromCardano, transactionPrototypeFromHex } from "../../src/tx-prototype-from-cbor";
import { transactionPrototypeToHex } from "../../src/tx-prototype-to-cbor";
import { nativeScriptPrototypeToCardano } from "../../src/tx-prototype-to-cbor/native-script";
import { HexBlob, NativeScript } from "../../src/types";
import { toNativeScript } from "../../src/utils";

const KEY_HASH = "aa".repeat(28);

describe("nativeScriptPrototypeToCardano", () => {
  it("converts SCRIPT_PUBKEY", () => {
    const script = nativeScriptPrototypeToCardano({
      type: "SCRIPT_PUBKEY",
      value: { addr_keyhash: KEY_HASH },
    });
    expect(script.asScriptPubkey()!.keyHash().toString()).toEqual(KEY_HASH);
  });

  it("converts SCRIPT_ALL with nested scripts", () => {
    const script = nativeScriptPrototypeToCardano({
      type: "SCRIPT_ALL",
      value: {
        native_scripts: [{ type: "SCRIPT_PUBKEY", value: { addr_keyhash: KEY_HASH } }],
      },
    });
    const all = script.asScriptAll()!;
    expect(all.nativeScripts()).toHaveLength(1);
    expect(all.nativeScripts()[0]!.asScriptPubkey()!.keyHash().toString()).toEqual(KEY_HASH);
  });

  it("converts SCRIPT_ANY", () => {
    const script = nativeScriptPrototypeToCardano({
      type: "SCRIPT_ANY",
      value: {
        native_scripts: [{ type: "SCRIPT_PUBKEY", value: { addr_keyhash: KEY_HASH } }],
      },
    });
    expect(script.asScriptAny()!.nativeScripts()).toHaveLength(1);
  });

  it("converts SCRIPT_N_OF_K", () => {
    const script = nativeScriptPrototypeToCardano({
      type: "SCRIPT_N_OF_K",
      value: {
        n: 1n,
        native_scripts: [
          { type: "SCRIPT_PUBKEY", value: { addr_keyhash: KEY_HASH } },
          { type: "SCRIPT_PUBKEY", value: { addr_keyhash: "bb".repeat(28) } },
        ],
      },
    });
    const nOfK = script.asScriptNOfK()!;
    expect(nOfK.required()).toEqual(1);
    expect(nOfK.nativeScripts()).toHaveLength(2);
  });

  it("converts TIMELOCK_START", () => {
    const script = nativeScriptPrototypeToCardano({
      type: "TIMELOCK_START",
      value: { slot: "100" },
    });
    expect(script.asTimelockStart()!.slot().toString()).toEqual("100");
  });

  it("converts TIMELOCK_EXPIRY", () => {
    const script = nativeScriptPrototypeToCardano({
      type: "TIMELOCK_EXPIRY",
      value: { slot: "200" },
    });
    expect(script.asTimelockExpiry()!.slot().toString()).toEqual("200");
  });
});

describe("a native script given in CBOR its structure is not written as", () => {
  it("is written in the bytes it holds, and hashed over them; without them, from its structure", () => {
    // `all` of none, its list of indefinite length
    const structure = {
      type: "SCRIPT_ALL" as const,
      value: { native_scripts: [] },
    };
    const given = nativeScriptPrototypeToCardano({
      ...structure,
      cbor: "82019fff",
    });
    expect(given.toCbor().toString()).toBe("82019fff");
    expect(given.hash().toString()).toBe(
      Crypto.blake2b.hash(HexBlob("0082019fff"), 28).toString(),
    );
    expect(nativeScriptPrototypeToCardano(structure).toCbor().toString()).toBe(
      "820180",
    );
  });
});

describe("the slot of a time lock and the n of an n-of-k script", () => {
  /** Slots, each with its shortest CBOR: 2^53 + 1 and above are not held by a Number */
  const SLOTS: [string, string][] = [
    ["0", "00"],
    ["9007199254740993", "1b0020000000000001"],
    ["18446744073709550591", "1bfffffffffffffbff"],
    ["18446744073709550592", "1bfffffffffffffc00"],
    ["18446744073709551615", "1bffffffffffffffff"],
  ];

  it("are written exactly from the structure, and read back exactly from the bytes", () => {
    for (const [slot, int] of SLOTS)
      for (const [type, kind] of [
        ["TIMELOCK_START", "04"],
        ["TIMELOCK_EXPIRY", "05"],
      ] as const) {
        const written = nativeScriptPrototypeToCardano({ type, value: { slot } });
        expect([slot, written.toCbor().toString()]).toEqual([slot, `82${kind}${int}`]);
        expect(nativeScriptPrototypeFromCardano(written)).toEqual({ type, value: { slot } });
        expect(
          nativeScriptPrototypeFromCardano(NativeScript.fromCbor(HexBlob(`82${kind}${int}`))),
        ).toEqual({ type, value: { slot } });
      }
    for (const [n, int] of [
      [2n ** 63n - 1n, "1b7fffffffffffffff"],
      [-(2n ** 63n), "3b7fffffffffffffff"],
      [2n ** 53n + 1n, "1b0020000000000001"],
      [-1n, "20"],
    ] as const) {
      const structure = {
        type: "SCRIPT_N_OF_K" as const,
        value: { n, native_scripts: [{ type: "SCRIPT_PUBKEY" as const, value: { addr_keyhash: KEY_HASH } }] },
      };
      const written = nativeScriptPrototypeToCardano(structure);
      expect([n, written.toCbor().toString()]).toEqual([n, `8303${int}81${"8200581c" + KEY_HASH}`]);
      expect(nativeScriptPrototypeFromCardano(written)).toEqual(structure);
    }
  });

  it("are written as the SDK's classes write a script whose numbers a Number holds", () => {
    const structure = {
      type: "SCRIPT_ANY" as const,
      value: {
        native_scripts: [
          { type: "SCRIPT_PUBKEY" as const, value: { addr_keyhash: KEY_HASH } },
          {
            type: "SCRIPT_N_OF_K" as const,
            value: {
              n: 2n,
              native_scripts: [
                { type: "TIMELOCK_START" as const, value: { slot: "4294967296" } },
                { type: "TIMELOCK_EXPIRY" as const, value: { slot: "23" } },
                { type: "SCRIPT_ALL" as const, value: { native_scripts: [] } },
              ],
            },
          },
        ],
      },
    };
    expect(nativeScriptPrototypeToCardano(structure).toCbor().toString()).toBe(
      toNativeScript({
        type: "any",
        scripts: [
          { type: "sig", keyHash: KEY_HASH },
          {
            type: "atLeast",
            required: 2,
            scripts: [
              { type: "after", slot: "4294967296" },
              { type: "before", slot: "23" },
              { type: "all", scripts: [] },
            ],
          },
        ],
      })
        .toCbor()
        .toString(),
    );
  });

  it("go through a transaction's prototype and back byte for byte", () => {
    const script = NativeScript.fromCbor(HexBlob(`820182${"8200581c" + KEY_HASH}82051bffffffffffffffff`));
    const witnessSet = new Serialization.TransactionWitnessSet();
    witnessSet.setNativeScripts(
      Serialization.CborSet.fromCore([script.toCore()], NativeScript.fromCore),
    );
    witnessSet.nativeScripts()!.setValues([script]);
    const body = new Serialization.TransactionBody(
      Serialization.CborSet.fromCore([], Serialization.TransactionInput.fromCore),
      [],
      0n,
    );
    const tx = new Serialization.Transaction(body, witnessSet).toCbor().toString();
    const prototype = transactionPrototypeFromHex(tx);
    expect(JSON.stringify(prototype.witness_set.native_scripts)).toContain('"slot":"18446744073709551615"');
    expect(transactionPrototypeToHex(prototype)).toBe(tx);
  });
});
