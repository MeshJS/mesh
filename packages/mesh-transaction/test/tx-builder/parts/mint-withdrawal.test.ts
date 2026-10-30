import {
  mConStr0,
  NativeScript,
  resolveNativeScriptHash,
  resolveScriptRef,
  UTxO,
} from "@meshsdk/core";
import { scriptHashToRewardAddress } from "@meshsdk/core-cst";

import {
  mint,
  TxPartError,
  unresolved,
  withdrawal,
} from "../../../src/tx-builder";
import {
  alwaysSucceedCbor,
  alwaysSucceedHash,
  baseAddress,
  rewardAddress,
} from "../../test-util";

const nativeScript: NativeScript = { type: "all", scripts: [] };
const nativeHash = resolveNativeScriptHash(nativeScript);
const plutusScript = { code: alwaysSucceedCbor, version: "V3" as const };
const redeemer = { data: mConStr0([]) };
const keyRewardAddress = rewardAddress(1);
const plutusRewardAddress = scriptHashToRewardAddress(alwaysSucceedHash, 0);
const nativeRewardAddress = scriptHashToRewardAddress(nativeHash, 0);
const refOut = { txHash: "c".repeat(64), outputIndex: 0 };
const refUtxo = (scriptRef: string): UTxO => ({
  input: refOut,
  output: {
    address: baseAddress(1),
    amount: [{ unit: "lovelace", quantity: "5000000" }],
    scriptRef,
  },
});

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

describe("mint", () => {
  it("mints and burns under a native policy, keyed by the script hash", () => {
    const part = mint.native({
      script: nativeScript,
      assets: { "0102": 10n, "": -1n },
      label: "tokens",
    });

    expect(part).toMatchObject({
      kind: "mint",
      policyId: nativeHash,
      assets: { "0102": "10", "": "-1" },
      witness: { type: "native", script: { type: "attached" } },
      label: "tokens",
    });
    expect(unresolved(part)).toEqual([]);
  });

  it("mints under a Plutus policy, leaving execution units to evaluation", () => {
    const part = mint.plutus({
      script: plutusScript,
      redeemer,
      assets: { abcd: 1n },
    });

    expect(part.policyId).toBe(alwaysSucceedHash);
    expect(part.witness).toMatchObject({
      type: "plutus",
      redeemer: { data: { type: "CBOR", hex: "d87980" } },
    });
    expect(unresolved(part)).toEqual([{ type: "exUnits" }]);
  });

  it("takes the policy from a full reference UTxO", () => {
    const part = mint.plutus({
      script: { reference: refUtxo(resolveScriptRef(plutusScript)) },
      redeemer: { ...redeemer, exUnits: { mem: 1, steps: 1 } },
      assets: { abcd: 1n },
    });

    expect(part.policyId).toBe(alwaysSucceedHash);
    expect(unresolved(part)).toEqual([]);
  });

  it("needs the policy id for a script referenced by out ref alone", () => {
    expectPartError(
      () => mint.native({ script: { reference: refOut }, assets: { "": 1n } }),
      "INVALID_SCRIPT",
    );

    const part = mint.native({
      script: { reference: refOut },
      policyId: nativeHash.toUpperCase(),
      assets: { "": 1n },
    });
    expect(part.policyId).toBe(nativeHash);
    expect(part.witness.script).toMatchObject({ scriptHash: nativeHash });
    expect(unresolved(part)).toEqual([
      {
        type: "scriptReference",
        input: { transaction_id: "c".repeat(64), index: 0 },
      },
    ]);
  });

  it("rejects a policy id that is not the script's hash", () => {
    expectPartError(
      () =>
        mint.native({
          script: nativeScript,
          policyId: alwaysSucceedHash,
          assets: { "": 1n },
        }),
      "INVALID_SCRIPT",
    );
  });

  it("rejects malformed assets", () => {
    for (const assets of [
      {},
      { "": 0n },
      { zz: 1n },
      { ["00".repeat(33)]: 1n },
      { "": 2n ** 63n },
      { ab: 1n, AB: 2n },
    ]) {
      expectPartError(
        () => mint.native({ script: nativeScript, assets }),
        "INVALID_VALUE",
      );
    }
  });
});

describe("withdrawal", () => {
  it("withdraws an amount from a key stake address", () => {
    const part = withdrawal.pubKey({
      rewardAddress: keyRewardAddress,
      amount: 5_000_000n,
    });

    expect(part).toEqual({
      kind: "withdrawal",
      rewardAddress: keyRewardAddress,
      amount: "5000000",
      witness: { type: "key" },
    });
    expect(unresolved(part)).toEqual([]);
  });

  it("leaves the balance to look up when withdrawing all", () => {
    const part = withdrawal.pubKey({
      rewardAddress: keyRewardAddress,
      amount: "all",
    });

    expect(part.amount).toBeUndefined();
    expect(unresolved(part)).toEqual([
      { type: "rewardBalance", rewardAddress: keyRewardAddress },
    ]);
  });

  it("runs a staking script with a zero withdrawal", () => {
    const part = withdrawal.plutus({
      rewardAddress: plutusRewardAddress,
      amount: 0n,
      script: plutusScript,
      redeemer,
    });

    expect(part.amount).toBe("0");
    expect(unresolved(part)).toEqual([{ type: "exUnits" }]);
  });

  it("takes a referenced script's hash from the stake credential", () => {
    const part = withdrawal.native({
      rewardAddress: nativeRewardAddress,
      amount: 0n,
      script: { reference: refOut },
    });

    expect(part.witness).toMatchObject({
      type: "native",
      script: { type: "reference", scriptHash: nativeHash },
    });
  });

  it("rejects a witness that does not match the stake credential", () => {
    expectPartError(
      () =>
        withdrawal.pubKey({ rewardAddress: plutusRewardAddress, amount: 0n }),
      "WITNESS_MISMATCH",
    );
    expectPartError(
      () =>
        withdrawal.native({
          rewardAddress: keyRewardAddress,
          amount: 0n,
          script: nativeScript,
        }),
      "WITNESS_MISMATCH",
    );
    expectPartError(
      () =>
        withdrawal.native({
          rewardAddress: plutusRewardAddress,
          amount: 0n,
          script: nativeScript,
        }),
      "WITNESS_MISMATCH",
    );
  });

  it("rejects a bad address or amount", () => {
    expectPartError(
      () => withdrawal.pubKey({ rewardAddress: baseAddress(1), amount: 1n }),
      "INVALID_ADDRESS",
    );
    expectPartError(
      () => withdrawal.pubKey({ rewardAddress: keyRewardAddress, amount: -1n }),
      "INVALID_VALUE",
    );
  });
});
