import {
  mConStr0,
  NativeScript,
  resolveDataHash,
  resolveScriptRef,
} from "@meshsdk/core";
import {
  keyHashToRewardAddress,
  scriptHashToRewardAddress,
} from "@meshsdk/core-cst";

import {
  collateralReturn,
  output,
  TxPartError,
  unresolved,
} from "../../../src/tx-builder";
import { alwaysSucceedCbor, baseAddress } from "../../test-util";

const address = baseAddress(1);
const policyA = "a".repeat(56);
const policyB = "b".repeat(56);
const unitDatum = mConStr0([]);

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

describe("output", () => {
  it.each([0, 1])(
    "rejects key and script reward addresses on network %s",
    (network) => {
      for (const rewardAddress of [
        keyHashToRewardAddress("a".repeat(56), network),
        scriptHashToRewardAddress("a".repeat(56), network),
      ]) {
        expectPartError(
          () =>
            output({ address: rewardAddress, value: { lovelace: 2_000_000n } }),
          "INVALID_ADDRESS",
        );
        expectPartError(
          () => collateralReturn({ address: rewardAddress }),
          "INVALID_ADDRESS",
        );
      }
    },
  );

  it("accepts Byron output addresses", () => {
    const byronAddress =
      "DdzFFzCqrhswh7xiYG8RE1TtcvWamhbExTXfsCYaF9PrGWHRLCwCsBH5JkeApUagvo4FZE3DJD3rn5hw8vaMBib2StKMJ77rJHt51jPt";
    expect(
      output({ address: byronAddress, value: { lovelace: 2_000_000n } }).output
        .address,
    ).toBe(byronAddress);
  });

  it("takes value as Mesh assets or as quantities by unit", () => {
    const fromAssets = output({
      address,
      value: [
        { unit: "lovelace", quantity: "2000000" },
        { unit: `${policyA}0102`, quantity: "5" },
        { unit: policyB, quantity: "1" },
        { unit: `${policyA}0102`, quantity: "2" },
      ],
    });
    const fromRecord = output({
      address,
      value: {
        lovelace: 2_000_000n,
        [`${policyA}0102`]: 7n,
        [policyB]: 1n,
      },
    });

    expect(fromAssets).toEqual({
      kind: "output",
      output: {
        address,
        amount: {
          coin: "2000000",
          multiasset: { [policyA]: { "0102": "7" }, [policyB]: { "": "1" } },
        },
      },
    });
    expect(fromRecord).toEqual(fromAssets);
    expect(unresolved(fromAssets)).toEqual([]);
  });

  it("leaves the lovelace to work out when none is given", () => {
    const part = output({ address, value: { [policyA]: 1n }, label: "nft" });

    expect(part.output.amount.coin).toBeUndefined();
    expect(part.label).toBe("nft");
    expect(unresolved(part)).toEqual([{ type: "minCoin" }]);
  });

  it("holds a datum inline, by hash, or by hash with the datum published", () => {
    const hash = resolveDataHash(unitDatum);

    expect(
      output({ address, value: [], datum: { type: "inline", data: unitDatum } })
        .output.plutus_data,
    ).toEqual({ type: "DATA", value: { type: "CBOR", hex: "d87980" } });

    const byHash = output({
      address,
      value: [],
      datum: { type: "hash", data: unitDatum },
    });
    expect(byHash.output.plutus_data).toEqual({
      type: "DATA_HASH",
      value: hash,
    });
    expect(byHash.embeddedDatum).toBeUndefined();

    const embedded = output({
      address,
      value: [],
      datum: { type: "hash", data: unitDatum, embed: true },
    });
    expect(embedded.output.plutus_data).toEqual({
      type: "DATA_HASH",
      value: hash,
    });
    expect(embedded.embeddedDatum).toEqual({ type: "CBOR", hex: "d87980" });

    expect(
      output({
        address,
        value: [],
        datum: { type: "hash", hash: hash.toUpperCase() },
      }).output.plutus_data,
    ).toEqual({ type: "DATA_HASH", value: hash });
  });

  it("carries a Plutus or native reference script", () => {
    const plutus = { code: alwaysSucceedCbor, version: "V3" as const };
    const native: NativeScript = { type: "all", scripts: [] };

    expect(
      output({ address, value: [], scriptRef: plutus }).output.script_ref,
    ).toBe(resolveScriptRef(plutus));
    expect(
      output({ address, value: [], scriptRef: native }).output.script_ref,
    ).toBe(resolveScriptRef(native));
  });

  it("rejects malformed values", () => {
    expectPartError(
      () => output({ address, value: [{ unit: "lovelace", quantity: "-1" }] }),
      "INVALID_VALUE",
    );
    expectPartError(
      () => output({ address, value: { lovelace: 0n } }),
      "INVALID_VALUE",
    );
    expectPartError(
      () => output({ address, value: { abc: 1n } }),
      "INVALID_VALUE",
    );
    expectPartError(
      () =>
        output({ address, value: { [`${policyA}${"00".repeat(33)}`]: 1n } }),
      "INVALID_VALUE",
    );
  });

  it("refuses a quantity above what an output holds, naming the part and the unit", () => {
    const max = 2n ** 64n - 1n;
    const unit = `${policyA}0a`;
    expect(
      output({ address, value: { lovelace: max } }).output.amount.coin,
    ).toBe(max.toString());
    for (const [value, shown] of [
      [{ lovelace: max + 1n }, "lovelace"],
      [[{ unit: "lovelace", quantity: (max + 1n).toString() }], "lovelace"],
      [{ lovelace: 2_000_000n, [unit]: max + 1n }, unit],
      // Two entries of one unit that come to more
      [
        [
          { unit, quantity: max.toString() },
          { unit, quantity: "1" },
        ],
        unit,
      ],
    ] as const) {
      let error: unknown;
      try {
        output({ address, value: value as never, label: "big" });
      } catch (thrown) {
        error = thrown;
      }
      expect(error).toBeInstanceOf(TxPartError);
      expect((error as TxPartError).code).toBe("INVALID_VALUE");
      expect((error as TxPartError).part).toBe("output");
      expect((error as TxPartError).label).toBe("big");
      expect((error as Error).message).toContain(shown);
    }
  });

  it("keeps the error an argument was rejected for as the cause", () => {
    const catchError = (build: () => unknown) => {
      try {
        build();
      } catch (error) {
        return error as TxPartError;
      }
      throw new Error("expected an error");
    };
    const badData = catchError(() =>
      output({
        address,
        value: [],
        datum: { type: "inline", data: { type: "CBOR", content: "zz" } },
        label: "pay",
      }),
    );
    expect(badData).toBeInstanceOf(TxPartError);
    expect(badData).toMatchObject({
      code: "INVALID_DATA",
      part: "output",
      label: "pay",
    });
    expect(badData.cause).toBeInstanceOf(Error);
    expect(badData.message).toMatch(/^output "pay": invalid Plutus data: /);
    expect(badData.message.endsWith((badData.cause as Error).message)).toBe(
      true,
    );

    const badAddress = catchError(() =>
      output({ address: "addr_nope", value: [] }),
    );
    expect(badAddress).toMatchObject({ code: "INVALID_ADDRESS" });
    expect(badAddress.cause).toBeUndefined();
  });

  it("holds an inline datum only as one item of Plutus data, as its UTxO is read back", () => {
    // Non-canonical, kept byte for byte
    const kept = output({
      address,
      value: [],
      datum: { type: "inline", data: { type: "CBOR", content: "d8799fff" } },
    });
    expect(kept.output.plutus_data).toEqual({
      type: "DATA",
      value: { type: "CBOR", hex: "d8799fff" },
    });
    for (const content of ["d8799fff00", "d8798000", "0102"])
      expectPartError(
        () =>
          output({
            address,
            value: [],
            datum: { type: "inline", data: { type: "CBOR", content } },
          }),
        "INVALID_DATA",
      );
  });

  it("rejects a bad address, datum hash or script", () => {
    expectPartError(
      () => output({ address: "nope", value: [] }),
      "INVALID_ADDRESS",
    );
    expectPartError(
      () => output({ address, value: [], datum: { type: "hash", hash: "00" } }),
      "INVALID_DATA",
    );
    expectPartError(
      () =>
        output({
          address,
          value: [],
          scriptRef: { code: "zz", version: "V3" },
        }),
      "INVALID_SCRIPT",
    );
  });

  it("refuses a scriptRef that is not a script object, its CBOR among them, naming its JavaScript type alone", () => {
    const plutus = resolveScriptRef({ code: alwaysSucceedCbor, version: "V3" });
    const native = resolveScriptRef({ type: "all", scripts: [] });
    const symbol = Symbol("script");
    const cases: [unknown, string][] = [
      [plutus, "string"],
      [plutus.toUpperCase(), "string"],
      [native, "string"],
      [alwaysSucceedCbor, "string"],
      ["", "string"],
      [5, "number"],
      [0, "number"],
      [12345678901n, "bigint"],
      [true, "boolean"],
      [false, "boolean"],
      [null, "null"],
      [symbol, "symbol"],
      [() => native, "function"],
    ];
    for (const [scriptRef, type] of cases) {
      let error: unknown;
      try {
        output({ address, value: [], scriptRef: scriptRef as never });
      } catch (e) {
        error = e;
      }
      expect([type, error]).toEqual([type, expect.any(TxPartError)]);
      expect([type, (error as TxPartError).code]).toEqual([
        type,
        "INVALID_SCRIPT",
      ]);
      const message = (error as TxPartError).message;
      expect([type, message]).toEqual([
        type,
        `output: invalid reference script: expected a PlutusScript { code, version } or a NativeScript object, not the CBOR of a script; got a value of type ${type}`,
      ]);
    }
    // Left out only when not given
    expect(
      output({ address, value: [], scriptRef: undefined }).output,
    ).not.toHaveProperty("script_ref");
  });
});
