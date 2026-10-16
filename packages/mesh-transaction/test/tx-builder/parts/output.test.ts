import {
  mConStr0,
  NativeScript,
  resolveDataHash,
  resolveScriptRef,
} from "@meshsdk/core";

import { output, TxPartError, unresolved } from "../../../src/tx-builder";
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
});
