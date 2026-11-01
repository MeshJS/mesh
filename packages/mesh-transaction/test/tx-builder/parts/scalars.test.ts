import { NativeScript } from "@meshsdk/core";

import {
  auxiliaryScript,
  donation,
  metadata,
  networkId,
  requiredSigner,
  treasuryValue,
  TxPartError,
  unresolved,
  validity,
} from "../../../src/tx-builder";
import { alwaysSucceedCbor } from "../../test-util";

const expectPartError = (build: () => unknown, code: string) => {
  try {
    build();
  } catch (error) {
    expect(error).toBeInstanceOf(TxPartError);
    expect((error as TxPartError).code).toBe(code);
    return;
  }
  throw new Error(`expected a ${code} error`);
};

describe("requiredSigner", () => {
  it("takes a key hash", () => {
    const part = requiredSigner({ keyHash: "AB".repeat(28) });

    expect(part).toEqual({ kind: "requiredSigner", keyHash: "ab".repeat(28) });
    expect(unresolved(part)).toEqual([]);
  });

  it("rejects anything but a 28-byte hash", () => {
    expectPartError(() => requiredSigner({ keyHash: "ab" }), "INVALID_DATA");
  });
});

describe("validity", () => {
  it("bounds either or both ends, slot 0 included", () => {
    expect(validity({ invalidBefore: 0 })).toEqual({
      kind: "validity",
      invalidBefore: "0",
    });
    expect(validity({ invalidBefore: 10n, invalidHereafter: 20 })).toEqual({
      kind: "validity",
      invalidBefore: "10",
      invalidHereafter: "20",
    });
  });

  it("rejects an empty or inverted range and bad slots", () => {
    expectPartError(() => validity({}), "INVALID_DATA");
    expectPartError(
      () => validity({ invalidBefore: 20, invalidHereafter: 20 }),
      "INVALID_DATA",
    );
    expectPartError(() => validity({ invalidHereafter: -1 }), "INVALID_DATA");
    expectPartError(() => validity({ invalidHereafter: 1.5 }), "INVALID_DATA");
    expectPartError(
      () => validity({ invalidHereafter: 2n ** 64n }),
      "INVALID_DATA",
    );
  });
});

describe("metadata", () => {
  it("converts values to metadata", () => {
    const part = metadata({
      metadataLabel: 674,
      value: {
        msg: ["hello", 1, 2n ** 63n],
        raw: new Uint8Array([1, 2]),
        map: new Map<string | number, string>([[1, "one"]]),
      },
      label: "note",
    });

    expect(part).toEqual({
      kind: "metadata",
      metadataLabel: "674",
      value: {
        type: "MAP",
        value: [
          [
            { type: "STRING", value: "msg" },
            {
              type: "LIST",
              value: [
                { type: "STRING", value: "hello" },
                { type: "INT", value: 1n },
                { type: "INT", value: 2n ** 63n },
              ],
            },
          ],
          [
            { type: "STRING", value: "raw" },
            { type: "BYTES", value: [1, 2] },
          ],
          [
            { type: "STRING", value: "map" },
            {
              type: "MAP",
              value: [
                [
                  { type: "INT", value: 1n },
                  { type: "STRING", value: "one" },
                ],
              ],
            },
          ],
        ],
      },
      label: "note",
    });
  });

  it("rejects values the ledger does not accept", () => {
    for (const value of [
      "x".repeat(65),
      new Uint8Array(65),
      1.5,
      2n ** 64n,
      true as unknown as string,
    ]) {
      expectPartError(
        () => metadata({ metadataLabel: 1, value }),
        "INVALID_DATA",
      );
    }
    expectPartError(
      () => metadata({ metadataLabel: -1, value: 1 }),
      "INVALID_DATA",
    );
  });
});

describe("auxiliaryScript", () => {
  it("publishes a native or Plutus script", () => {
    const native: NativeScript = { type: "all", scripts: [] };

    expect(auxiliaryScript({ script: native }).script).toEqual({
      type: "native",
      script: { type: "SCRIPT_ALL", value: { native_scripts: [] } },
    });
    expect(
      auxiliaryScript({ script: { code: alwaysSucceedCbor, version: "V3" } })
        .script,
    ).toMatchObject({ type: "plutus", version: "V3" });
    expectPartError(
      () => auxiliaryScript({ script: { code: "zz", version: "V2" } }),
      "INVALID_SCRIPT",
    );
  });
});

describe("donation and treasury value", () => {
  it("takes lovelace amounts", () => {
    expect(donation({ amount: 1n })).toEqual({ kind: "donation", amount: "1" });
    expect(treasuryValue({ amount: 0n })).toEqual({
      kind: "treasuryValue",
      amount: "0",
    });
  });

  it("rejects a donation of nothing and negative amounts", () => {
    expectPartError(() => donation({ amount: 0n }), "INVALID_VALUE");
    expectPartError(() => treasuryValue({ amount: -1n }), "INVALID_VALUE");
  });
});

describe("networkId", () => {
  it("pins mainnet or testnet", () => {
    expect(networkId({ network: "mainnet" }).networkId).toEqual({
      type: "MAINNET",
    });
    expect(networkId({ network: "testnet" }).networkId).toEqual({
      type: "TESTNET",
    });
    expectPartError(
      () => networkId({ network: "preprod" as "testnet" }),
      "INVALID_DATA",
    );
  });
});
