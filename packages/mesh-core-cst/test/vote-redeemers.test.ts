import { Serialization } from "@cardano-sdk/core";

import {
  DEFAULT_PROTOCOL_PARAMETERS,
  emptyTxBuilderBody,
  MeshTxBuilderBody,
  Vote,
} from "@meshsdk/common";
import {
  MeshTxBuilder,
  OfflineFetcher,
  resolveScriptHash,
} from "@meshsdk/core";

import {
  blake2b,
  CardanoSDKSerializer,
  CredentialType,
  DRepID,
  Hash28ByteBase16,
  RedeemerTag,
  Transaction,
  TxCBOR,
} from "../src";

const { VoterKind } = Serialization;

const ADDR =
  "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9";
const txHash = (seed: string): string =>
  blake2b.hash(Buffer.from(seed, "utf-8"), 32);
const keyHashHex = (i: number): string =>
  Buffer.from(String(i).padStart(28, "0"), "utf-8").toString("hex");
const lovelace = [{ unit: "lovelace", quantity: "100000000" }];

// Aiken "always succeeds" validator, double CBOR encoded as Mesh expects script code
const alwaysSucceedCbor =
  "5836" +
  "58340101002332259800a518a4d153300249011856616c696461746f722072657475726e65642066616c736500136564004ae715cd01";
const scriptDrep = DRepID.cip129FromCredential({
  type: CredentialType.ScriptHash,
  hash: Hash28ByteBase16(resolveScriptHash(alwaysSucceedCbor, "V3")),
});
const GOV = { txHash: txHash("gov1"), txIndex: 0 };
const GOV2 = { txHash: txHash("gov2"), txIndex: 1 };

const fetcher = new OfflineFetcher();
fetcher.addUTxOs([
  {
    input: { txHash: txHash("tx1"), outputIndex: 0 },
    output: { address: ADDR, amount: lovelace },
  },
]);

const txBuilder = () =>
  new MeshTxBuilder({
    fetcher,
    evaluator: null,
    serializer: new CardanoSDKSerializer(),
  });

const voterKinds = (txHex: string) =>
  Transaction.fromCbor(TxCBOR(txHex))
    .body()
    .votingProcedures()!
    .getVoters()
    .map((voter) => voter.kind());

const votingRedeemerIndexes = (txHex: string) =>
  (Transaction.fromCbor(TxCBOR(txHex)).witnessSet().redeemers()?.values() ?? [])
    .filter((redeemer) => redeemer.tag() === RedeemerTag.Voting)
    .map((redeemer) => Number(redeemer.index()));

describe("Voting redeemers", () => {
  it("declares one redeemer per voter, indexed by the voter's position in ledger order", async () => {
    const txHex = await txBuilder()
      .vote({ type: "StakingPool", keyHash: keyHashHex(1) }, GOV, {
        voteKind: "Abstain",
      })
      .votePlutusScriptV3()
      .vote({ type: "DRep", drepId: scriptDrep }, GOV, { voteKind: "Yes" })
      .voteScript(alwaysSucceedCbor)
      .voteRedeemerValue("")
      .votePlutusScriptV3()
      .vote({ type: "DRep", drepId: scriptDrep }, GOV2, { voteKind: "No" })
      .voteScript(alwaysSucceedCbor)
      .voteRedeemerValue("")
      .vote(
        {
          type: "ConstitutionalCommittee",
          hotCred: { type: "KeyHash", keyHash: keyHashHex(2) },
        },
        GOV,
        { voteKind: "Yes" },
      )
      .txIn(txHash("tx1"), 0)
      .txInCollateral(txHash("tx1"), 0)
      .changeAddress(ADDR)
      .complete();

    expect(voterKinds(txHex)).toEqual([
      VoterKind.ConstitutionalCommitteeKeyHash,
      VoterKind.DRepScriptHash,
      VoterKind.StakePoolKeyHash,
    ]);
    // the DRep script runs once for both of its votes
    expect(votingRedeemerIndexes(txHex)).toEqual([1]);
  });

  it("rejects different redeemers for the votes of one voter", async () => {
    await expect(
      txBuilder()
        .votePlutusScriptV3()
        .vote({ type: "DRep", drepId: scriptDrep }, GOV, { voteKind: "Yes" })
        .voteScript(alwaysSucceedCbor)
        .voteRedeemerValue("")
        .votePlutusScriptV3()
        .vote({ type: "DRep", drepId: scriptDrep }, GOV2, { voteKind: "No" })
        .voteScript(alwaysSucceedCbor)
        .voteRedeemerValue(1)
        .txIn(txHash("tx1"), 0)
        .txInCollateral(txHash("tx1"), 0)
        .changeAddress(ADDR)
        .complete(),
    ).rejects.toThrow("The same voter must have the same redeemer");
  });

  it("indexes by ledger order even when the body lists the voters in another order", () => {
    const votes: Vote[] = [
      {
        type: "BasicVote",
        vote: {
          voter: { type: "StakingPool", keyHash: keyHashHex(1) },
          govActionId: GOV,
          votingProcedure: { voteKind: "Abstain" },
        },
      },
      {
        type: "ScriptVote",
        vote: {
          voter: { type: "DRep", drepId: scriptDrep },
          govActionId: GOV,
          votingProcedure: { voteKind: "Yes" },
        },
        redeemer: {
          data: { type: "CBOR", content: "40" },
          exUnits: { mem: 1000, steps: 1000 },
        },
        scriptSource: {
          type: "Provided",
          script: { code: alwaysSucceedCbor, version: "V3" },
        },
      },
    ];
    const txIn = {
      txHash: txHash("tx1"),
      txIndex: 0,
      amount: lovelace,
      address: ADDR,
    };
    const body: MeshTxBuilderBody = {
      ...emptyTxBuilderBody(),
      inputs: [{ type: "PubKey", txIn }],
      collaterals: [{ type: "PubKey", txIn }],
      votes,
      changeAddress: ADDR,
    };
    const txHex = new CardanoSDKSerializer().serializeTxBody(
      body,
      DEFAULT_PROTOCOL_PARAMETERS,
    );

    // the voters are encoded as given, the pool first, but the ledger orders the DRep first
    expect(voterKinds(txHex)).toEqual([
      VoterKind.StakePoolKeyHash,
      VoterKind.DRepScriptHash,
    ]);
    expect(votingRedeemerIndexes(txHex)).toEqual([0]);
  });
});
