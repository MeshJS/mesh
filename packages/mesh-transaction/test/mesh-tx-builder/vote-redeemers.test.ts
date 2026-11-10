import { IEvaluator } from "@meshsdk/common";
import { OfflineFetcher } from "@meshsdk/core";
import {
  CredentialType,
  DRepID,
  Hash28ByteBase16,
  RedeemerTag,
  Transaction,
  TxCBOR,
} from "@meshsdk/core-cst";

import { MeshTxBuilder } from "../../src";
import {
  alwaysSucceedCbor,
  alwaysSucceedHash,
  keyHashHex,
  txHash,
} from "../test-util";

const ADDR =
  "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9";
const lovelace = [{ unit: "lovelace", quantity: "100000000" }];
const scriptDrep = DRepID.cip129FromCredential({
  type: CredentialType.ScriptHash,
  hash: Hash28ByteBase16(alwaysSucceedHash),
});
const GOV = { txHash: txHash("gov1"), txIndex: 0 };
const GOV2 = { txHash: txHash("gov2"), txIndex: 1 };
const budget = { mem: 123456, steps: 7890123 };

const fetcher = new OfflineFetcher();
fetcher.addUTxOs([
  {
    input: { txHash: txHash("tx1"), outputIndex: 0 },
    output: { address: ADDR, amount: lovelace },
  },
]);

/** Answers like a node: one budget per voter, indexed by the voter's position in ledger order */
const evaluator: IEvaluator = {
  evaluateTx: async () => [{ tag: "VOTE", index: 1, budget }],
};

describe("MeshTxBuilder - voting redeemers", () => {
  it("applies the evaluated budget of a voter to all of its votes and declares it once", async () => {
    const txBuilder = new MeshTxBuilder({ fetcher, evaluator });
    const txHex = await txBuilder
      .vote(
        {
          type: "ConstitutionalCommittee",
          hotCred: { type: "KeyHash", keyHash: keyHashHex(2) },
        },
        GOV,
        { voteKind: "Yes" },
      )
      .votePlutusScriptV3()
      .vote({ type: "DRep", drepId: scriptDrep }, GOV, { voteKind: "Yes" })
      .voteScript(alwaysSucceedCbor)
      .voteRedeemerValue("")
      .votePlutusScriptV3()
      .vote({ type: "DRep", drepId: scriptDrep }, GOV2, { voteKind: "No" })
      .voteScript(alwaysSucceedCbor)
      .voteRedeemerValue("")
      .txIn(txHash("tx1"), 0)
      .txInCollateral(txHash("tx1"), 0)
      .changeAddress(ADDR)
      .complete();

    const scriptVotes = txBuilder.meshTxBuilderBody.votes.filter(
      (vote) => vote.type === "ScriptVote",
    );
    expect(scriptVotes).toHaveLength(2);
    for (const vote of scriptVotes) {
      expect(vote.type === "ScriptVote" && vote.redeemer?.exUnits).toEqual(
        budget,
      );
    }

    const redeemers = Transaction.fromCbor(TxCBOR(txHex))
      .witnessSet()
      .redeemers()!
      .values()
      .map((redeemer) => [
        redeemer.tag(),
        Number(redeemer.index()),
        Number(redeemer.exUnits().mem()),
        Number(redeemer.exUnits().steps()),
      ]);
    expect(redeemers).toEqual([
      [RedeemerTag.Voting, 1, budget.mem, budget.steps],
    ]);
  });
});
