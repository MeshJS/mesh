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
  MintAssetsInput,
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
    for (const assets of <MintAssetsInput[]>[
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

  it("leaves a script's reward address out, keeping the script's hash", () => {
    const plutus = withdrawal.plutus({
      amount: 0n,
      script: plutusScript,
      redeemer,
      label: "zero",
    });
    const native = withdrawal.native({ amount: 5n, script: nativeScript });

    expect(plutus).toEqual({
      kind: "withdrawal",
      amount: "0",
      witness: {
        type: "plutus",
        script: expect.objectContaining({ scriptHash: alwaysSucceedHash }),
        redeemer: { data: { type: "CBOR", hex: "d87980" } },
      },
      label: "zero",
    });
    expect("rewardAddress" in plutus).toBe(false);
    expect(unresolved(plutus)).toEqual([
      { type: "rewardAddress" },
      { type: "exUnits" },
    ]);
    expect(Object.keys(native).sort()).toEqual(["amount", "kind", "witness"]);
    expect(native.witness).toMatchObject({
      type: "native",
      script: { scriptHash: nativeHash },
    });
    expect(unresolved(native)).toEqual([{ type: "rewardAddress" }]);
  });

  it("withdraws all from an address not derived yet: the balance gap has no address", () => {
    const part = withdrawal.native({ amount: "all", script: nativeScript });

    expect(part.amount).toBeUndefined();
    expect(unresolved(part)).toEqual([
      { type: "rewardAddress" },
      { type: "rewardBalance" },
    ]);
  });

  it("needs a known script hash when the reward address is left out", () => {
    for (const make of [
      () =>
        withdrawal.native({
          amount: 0n,
          script: { reference: refOut },
          label: "by ref",
        }),
      () =>
        withdrawal.plutus({
          amount: 0n,
          script: { reference: refOut, version: "V3" },
          redeemer,
          label: "by ref",
        }),
    ]) {
      try {
        make();
        throw new Error("expected INVALID_SCRIPT");
      } catch (error) {
        expect(error).toBeInstanceOf(TxPartError);
        expect((error as TxPartError).code).toBe("INVALID_SCRIPT");
        expect((error as TxPartError).label).toBe("by ref");
        expect((error as TxPartError).message).toMatch(
          /rewardAddress, scriptHash, or the reference UTxO in full/,
        );
      }
    }

    const stated = withdrawal.native({
      amount: 0n,
      script: { reference: refOut, scriptHash: nativeHash },
    });
    const held = withdrawal.plutus({
      amount: 0n,
      script: { reference: refUtxo(resolveScriptRef(plutusScript)) },
      redeemer,
    });
    expect(stated.rewardAddress).toBeUndefined();
    expect(stated.witness).toMatchObject({
      script: { scriptHash: nativeHash },
    });
    expect(held.rewardAddress).toBeUndefined();
    expect(held.witness).toMatchObject({
      script: { scriptHash: alwaysSucceedHash },
    });
  });

  it("checks a given reward address against the script", () => {
    expectPartError(
      () =>
        withdrawal.plutus({
          rewardAddress: nativeRewardAddress,
          amount: 0n,
          script: plutusScript,
          redeemer,
        }),
      "WITNESS_MISMATCH",
    );
  });

  it("needs the reward address of a key withdrawal", () => {
    expectPartError(
      // @ts-expect-error A key credential's address cannot be derived
      () => withdrawal.pubKey({ amount: 0n }),
      "INVALID_ADDRESS",
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
