import { NativeScript } from "@meshsdk/core";
import {
  Address,
  HexBlob,
  keyHashToRewardAddress,
  scriptHashToRewardAddress,
} from "@meshsdk/core-cst";

import {
  auxiliaryScript,
  donation,
  guard,
  message,
  metadata,
  mint,
  networkId,
  treasuryValue,
  TxPartError,
  unresolved,
  validity,
} from "../../../src/tx-builder";
import { alwaysSucceedCbor, baseAddress, keyHashHex } from "../../test-util";

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

/** A Shelley address on a test network from its header byte and payment (and stake) hash */
const shelleyAddress = (header: number, ...hashes: string[]) =>
  Address.fromBytes(
    HexBlob(header.toString(16).padStart(2, "0") + hashes.join("")),
  ).toBech32();
const hexOf = (bech32: string) => Address.fromBech32(bech32).toBytes();
const byronAddress =
  "DdzFFzCqrhswh7xiYG8RE1TtcvWamhbExTXfsCYaF9PrGWHRLCwCsBH5JkeApUagvo4FZE3DJD3rn5hw8vaMBib2StKMJ77rJHt51jPt";

/** The TxPartError a call throws */
const partError = (build: () => unknown): TxPartError => {
  try {
    build();
  } catch (error) {
    expect(error).toBeInstanceOf(TxPartError);
    return error as TxPartError;
  }
  throw new Error("expected a TxPartError");
};

describe("guard.pubKey", () => {
  it("takes a key hash in either case and keeps it in lower case", () => {
    const part = guard.pubKey({ keyHash: "AB".repeat(28) });

    expect(part).toEqual({
      kind: "guard",
      credential: { type: "KEY", value: "ab".repeat(28) },
      witness: { type: "key" },
    });
    expect(Object.isFrozen(part)).toBe(true);
    expect(Object.isFrozen(part.credential)).toBe(true);
    expect(unresolved(part)).toEqual([]);
    expect(
      guard.pubKey({ keyHash: "ab".repeat(28), label: "approver" }).label,
    ).toBe("approver");
  });

  it("rejects anything but a 28-byte hash, naming the part", () => {
    const error = partError(() =>
      guard.pubKey({ keyHash: "ab", label: "approver" }),
    );
    expect(error.code).toBe("INVALID_DATA");
    expect(error.part).toBe("guard");
    expect(error.label).toBe("approver");
  });

  it("takes the payment key of an address, in bech32 or hex", () => {
    const fromHash = guard.pubKey({ keyHash: keyHashHex(1) });
    const base = baseAddress(1);

    expect(guard.pubKey({ address: base })).toEqual(fromHash);
    expect(guard.pubKey({ address: hexOf(base) })).toEqual(fromHash);
    // An enterprise address of the same key
    expect(
      guard.pubKey({ address: shelleyAddress(0x60, keyHashHex(1)) }),
    ).toEqual(fromHash);
  });

  it("refuses a script address, and a string that is no address", () => {
    const script = shelleyAddress(0x70, "c".repeat(56));
    expectPartError(
      () => guard.pubKey({ address: script }),
      "WITNESS_MISMATCH",
    );
    expectPartError(
      () => guard.pubKey({ address: hexOf(script) }),
      "WITNESS_MISMATCH",
    );
    expectPartError(
      () => guard.pubKey({ address: "not an address" }),
      "INVALID_ADDRESS",
    );
  });

  it("refuses reward and Byron addresses, which have no payment key", () => {
    for (const address of [
      keyHashToRewardAddress(keyHashHex(1), 0),
      scriptHashToRewardAddress("c".repeat(56), 0),
      byronAddress,
    ])
      expectPartError(() => guard.pubKey({ address }), "INVALID_ADDRESS");
  });

  it("refuses both forms at once, also naming one key, and neither", () => {
    expectPartError(
      () =>
        guard.pubKey({
          keyHash: keyHashHex(1),
          address: baseAddress(1),
        } as unknown as { keyHash: string }),
      "INVALID_DATA",
    );
    expectPartError(
      () =>
        guard.pubKey({
          keyHash: keyHashHex(2),
          address: baseAddress(1),
        } as unknown as { keyHash: string }),
      "INVALID_DATA",
    );
    expectPartError(
      () => guard.pubKey({} as unknown as { keyHash: string }),
      "INVALID_DATA",
    );
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

  it("rejects a slot above 1e11, which looks like POSIX milliseconds", () => {
    const messageOf = (build: () => unknown) => {
      try {
        build();
      } catch (error) {
        expect(error).toBeInstanceOf(TxPartError);
        expect((error as TxPartError).code).toBe("INVALID_DATA");
        return (error as TxPartError).message;
      }
      throw new Error("expected an INVALID_DATA error");
    };

    expect(
      messageOf(() => validity({ invalidBefore: 1_793_788_355_463 })),
    ).toMatch(/invalidBefore 1793788355463 .*POSIX milliseconds/);
    expect(
      messageOf(() => validity({ invalidHereafter: 1_793_788_355_463n })),
    ).toMatch(/invalidHereafter 1793788355463 .*POSIX milliseconds/);
    expect(
      messageOf(() => validity({ invalidBefore: 100_000_000_001 })),
    ).toMatch(/invalidBefore 100000000001 .*POSIX milliseconds/);
    expect(messageOf(() => validity({ invalidHereafter: 2n ** 64n }))).toMatch(
      /invalid invalidHereafter slot /,
    );

    expect(validity({ invalidHereafter: 100_000_000_000 })).toEqual({
      kind: "validity",
      invalidHereafter: "100000000000",
    });
    // Slots inside native scripts are not checked
    expect(
      mint.native({
        script: { type: "after", slot: "1793788355463" },
        assets: { "01": 1n },
      }).kind,
    ).toBe("mint");
  });
});

describe("validity in POSIX time", () => {
  // Slot 100000000 of preprod starts at T
  const S = 100000000;
  const T = 1755683200000;

  const partErrorOf = (build: () => unknown): TxPartError => {
    try {
      build();
    } catch (error) {
      expect(error).toBeInstanceOf(TxPartError);
      expect((error as TxPartError).code).toBe("INVALID_DATA");
      return error as TxPartError;
    }
    throw new Error("expected an INVALID_DATA error");
  };

  it("holds the time bounds as numbers, without slots", () => {
    const part = validity({ from: T, until: T + 600000 });

    expect(part).toStrictEqual({
      kind: "validity",
      from: T,
      until: T + 600000,
    });
    expect(Object.isFrozen(part)).toBe(true);
    expect(validity({ from: T })).toStrictEqual({ kind: "validity", from: T });
    expect(validity({ until: T })).toStrictEqual({
      kind: "validity",
      until: T,
    });
  });

  it("takes a bigint or a Date as the equal number", () => {
    expect(
      validity({
        from: BigInt(T),
        until: new Date(T + 600000),
        label: "window",
      }),
    ).toStrictEqual({
      kind: "validity",
      from: T,
      until: T + 600000,
      label: "window",
    });
    expect(
      validity({ from: BigInt(T), until: new Date(T + 600000) }),
    ).toStrictEqual({ kind: "validity", from: T, until: T + 600000 });
  });

  it("takes each bound in either form", () => {
    expect(validity({ invalidBefore: 10, until: T })).toStrictEqual({
      kind: "validity",
      invalidBefore: "10",
      until: T,
    });
    expect(validity({ from: T, invalidHereafter: S + 600 })).toStrictEqual({
      kind: "validity",
      from: T,
      invalidHereafter: "100000600",
    });
  });

  it("refuses a time from 2^53 up", () => {
    for (const bound of ["from", "until"] as const) {
      partErrorOf(() => validity({ [bound]: 2n ** 53n + 1n }));
      partErrorOf(() => validity({ [bound]: 2n ** 53n }));
      partErrorOf(() => validity({ [bound]: 2 ** 53 }));
      expect(validity({ [bound]: 2n ** 53n - 1n })).toStrictEqual({
        kind: "validity",
        [bound]: Number.MAX_SAFE_INTEGER,
      });
    }
  });

  it("refuses a time that is not a whole number of milliseconds, 0 or more", () => {
    const bad = [
      NaN,
      Infinity,
      1.5,
      -1,
      -1n,
      new Date(NaN),
      new Date(-1),
      "2026-01-01" as never,
      null as never,
    ];
    for (const bound of ["from", "until"] as const) {
      for (const time of bad) partErrorOf(() => validity({ [bound]: time }));
      for (const time of [0, 0n, new Date(0)])
        expect(validity({ [bound]: time })).toStrictEqual({
          kind: "validity",
          [bound]: 0,
        });
    }
  });

  it("refuses a bound given both ways", () => {
    expect(
      partErrorOf(() => validity({ from: T, invalidBefore: S })).message,
    ).toMatch(/lower bound is given both ways/);
    expect(
      partErrorOf(() => validity({ until: T, invalidHereafter: S })).message,
    ).toMatch(/upper bound is given both ways/);
  });

  it("refuses a lower bound not before the upper one", () => {
    partErrorOf(() => validity({ from: T, until: T }));
    partErrorOf(() => validity({ from: T + 1, until: T }));
  });

  it("names the part and its label in what it refuses", () => {
    const calls: (() => unknown)[] = [
      () => validity({ from: 2n ** 53n, label: "window" }),
      () => validity({ until: -1, label: "window" }),
      () => validity({ from: T, invalidBefore: S, label: "window" }),
      () => validity({ from: T, until: T, label: "window" }),
    ];
    for (const call of calls) {
      const error = partErrorOf(call);
      expect(error.part).toBe("validity");
      expect(error.label).toBe("window");
    }
  });

  it("leaves the slot of a time bound to be filled in", () => {
    for (const part of [
      validity({ from: T }),
      validity({ until: T }),
      validity({ from: T, until: T + 1 }),
      validity({ invalidBefore: 10, until: T }),
    ])
      expect(unresolved(part)).toEqual([{ type: "slot" }]);
    expect(
      unresolved(validity({ invalidBefore: 10, invalidHereafter: 20 })),
    ).toEqual([]);
  });

  it("names the time argument for a slot that looks like POSIX milliseconds", () => {
    expect(
      partErrorOf(() => validity({ invalidBefore: 1_793_788_355_463 })).message,
    ).toMatch(/POSIX milliseconds.*\bfrom\b/);
    expect(
      partErrorOf(() => validity({ invalidHereafter: 1_793_788_355_463 }))
        .message,
    ).toMatch(/POSIX milliseconds.*\buntil\b/);
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

describe("message", () => {
  const linesOf = (part: ReturnType<typeof message>) => {
    const value = part.value as {
      type: "MAP";
      value: [unknown, { type: "LIST"; value: { value: string }[] }][];
    };
    return value.value[0]![1].value.map((line) => line.value);
  };
  const bytes = (text: string) => new TextEncoder().encode(text).length;

  it("is CIP-20 metadata under label 674, labelled as given", () => {
    expect(message({ text: "Invoice #42 paid" })).toEqual(
      metadata({ metadataLabel: 674, value: { msg: ["Invoice #42 paid"] } }),
    );
    const part = message({ text: "Invoice #42 paid", label: "memo" });
    expect(part.label).toBe("memo");
    expect(part.metadataLabel).toBe("674");
  });

  it("cuts text longer than 64 bytes into lines of 64", () => {
    expect(linesOf(message({ text: "a".repeat(65) })).map(bytes)).toEqual([
      64, 1,
    ]);
    expect(linesOf(message({ text: "b".repeat(129) })).map(bytes)).toEqual([
      64, 64, 1,
    ]);
  });

  it("cuts only between characters, a code point being one", () => {
    const twoByte = "é".repeat(33);
    expect(linesOf(message({ text: twoByte }))).toEqual(["é".repeat(32), "é"]);
    // A four-byte character is two code units of the string, and is never cut in two
    const mixed = "a".repeat(62) + "😀";
    const lines = linesOf(message({ text: mixed }));
    expect(lines).toEqual(["a".repeat(62), "😀"]);
    // Its first code unit alone would still fit in the line
    expect(linesOf(message({ text: "a".repeat(61) + "😀" }))).toEqual([
      "a".repeat(61),
      "😀",
    ]);
    for (const text of [twoByte, mixed, "ж😀a".repeat(40)]) {
      const cut = linesOf(message({ text }));
      expect(cut.join("")).toBe(text);
      for (const line of cut) expect(bytes(line)).toBeLessThanOrEqual(64);
    }
  });

  it("cuts each text of a list on its own, keeping the order", () => {
    expect(
      linesOf(message({ text: ["short", "c".repeat(70), "last"] })),
    ).toEqual(["short", "c".repeat(64), "c".repeat(6), "last"]);
  });

  it("keeps an empty text as an empty line", () => {
    expect(linesOf(message({ text: "" }))).toEqual([""]);
    expect(linesOf(message({ text: ["a", "", "b"] }))).toEqual(["a", "", "b"]);
  });

  it("refuses an empty list and what is not text", () => {
    for (const text of [[], 42, ["a", 7], null])
      expect(
        partError(() =>
          message({ text: text as unknown as string, label: "memo" }),
        ),
      ).toMatchObject({
        code: "INVALID_DATA",
        part: "metadata",
        label: "memo",
      });
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
