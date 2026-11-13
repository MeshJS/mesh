import { mConStr0, resolvePlutusScriptAddress, UTxO } from "@meshsdk/core";
import { scriptHashToRewardAddress } from "@meshsdk/core-cst";

import {
  certificate,
  mint,
  proposal,
  RedeemerContext,
  RedeemerInput,
  spend,
  TxPart,
  TxPartError,
  unresolved,
  vote,
  withdrawal,
} from "../../../src/tx-builder";
import {
  alwaysSucceedCbor,
  alwaysSucceedHash,
  keyHashHex,
} from "../../test-util";

const plutusScript = { code: alwaysSucceedCbor, version: "V3" as const };
const scriptAddress = resolvePlutusScriptAddress(plutusScript, 0);
const stake = scriptHashToRewardAddress(alwaysSucceedHash, 0);
const anchor = { url: "https://example.com/a.json", dataHash: "ab".repeat(32) };
const locked: UTxO = {
  input: { txHash: "a".repeat(64), outputIndex: 0 },
  output: {
    address: scriptAddress,
    amount: [{ unit: "lovelace", quantity: "5000000" }],
    plutusData: "d87980",
  },
};

/** Every part builder that takes a redeemer, given the one redeemer */
const redeemerParts = (redeemer: RedeemerInput): [string, () => TxPart][] => [
  [
    "spend.plutus",
    () => spend.plutus({ utxo: locked, script: plutusScript, redeemer }),
  ],
  [
    "mint.plutus",
    () => mint.plutus({ script: plutusScript, redeemer, assets: { "": 1n } }),
  ],
  [
    "withdrawal.plutus",
    () =>
      withdrawal.plutus({
        rewardAddress: stake,
        amount: 0n,
        script: plutusScript,
        redeemer,
      }),
  ],
  [
    "certificate",
    () =>
      certificate.stakeDelegation({
        stake,
        pool: keyHashHex(9),
        witness: { plutus: plutusScript, redeemer },
      }),
  ],
  [
    "vote",
    () =>
      vote({
        voter: { drep: { type: "SCRIPT", value: alwaysSucceedHash } },
        votes: [{ action: { txHash: "b".repeat(64), index: 0 }, vote: "yes" }],
        witness: { plutus: plutusScript, redeemer },
      }),
  ],
  [
    "proposal",
    () =>
      proposal.treasuryWithdrawals({
        rewardAccount: stake,
        anchor,
        deposit: 1000n,
        withdrawals: { [stake]: 5n },
        guardrail: { plutus: plutusScript, redeemer },
      }),
  ],
];

const redeemerOf = (part: TxPart) => {
  const { witness } = part as Extract<TxPart, { witness: unknown }>;
  if (witness.type !== "plutus") throw new Error("no redeemer");
  return witness.redeemer;
};

const isFrozenAnywhere = (value: unknown): boolean =>
  value === null ||
  typeof value !== "object" ||
  (Object.isFrozen(value) &&
    Object.values(value as object).every(isFrozenAnywhere));

describe("redeemer functions in parts", () => {
  const fn = jest.fn((tx: RedeemerContext) => mConStr0([tx.self]));
  beforeEach(() => fn.mockClear());

  it.each(redeemerParts({ data: fn }))(
    "%s keeps the function uncalled in a frozen part",
    (_, make) => {
      const part = make();

      expect(fn).not.toHaveBeenCalled();
      expect(redeemerOf(part).data).toEqual({ type: "deferred", build: fn });
      expect(isFrozenAnywhere(part)).toBe(true);
      expect(unresolved(part)).toEqual([{ type: "exUnits" }]);
    },
  );

  it.each(redeemerParts({ data: fn, exUnits: { mem: 10, steps: 20 } }))(
    "%s with execution units leaves nothing open",
    (_, make) => {
      const part = make();

      expect(fn).not.toHaveBeenCalled();
      expect(redeemerOf(part).exUnits).toEqual({ mem: "10", steps: "20" });
      expect(unresolved(part)).toEqual([]);
    },
  );

  it.each(redeemerParts({ data: fn, exUnits: { mem: -1, steps: 20 } }))(
    "%s still checks the execution units of a function at the call",
    (_, make) => {
      expect(make).toThrow(TxPartError);
      expect(fn).not.toHaveBeenCalled();
    },
  );

  it.each(redeemerParts({ data: { type: "CBOR", content: "zz" } }))(
    "%s still rejects a redeemer value at the call",
    (_, make) => {
      try {
        make();
      } catch (error) {
        expect(error).toBeInstanceOf(TxPartError);
        expect((error as TxPartError).code).toBe("INVALID_DATA");
        return;
      }
      throw new Error("expected INVALID_DATA");
    },
  );

  it("takes no asynchronous function", () => {
    spend.plutus({
      utxo: locked,
      script: plutusScript,
      // @ts-expect-error A redeemer function is synchronous
      redeemer: { data: async () => mConStr0([]) },
    });
  });
});
