import { Cardano, Serialization } from "@cardano-sdk/core";

import {
  ScriptVote,
  Vote,
  VoteKind,
  Voter,
  VoteType,
  VotingProcedure,
} from "@meshsdk/common";

import { CredentialCore, CredentialType, DRepID, RedeemerTag } from "../types";
import { compareCredentials, TxParserContext } from "./context";

const { VoterKind } = Serialization;

/** The credential that witnesses the votes of a voter (the pool key for SPOs) */
const voterCredential = (voter: Serialization.Voter): CredentialCore => {
  switch (voter.kind()) {
    case VoterKind.ConstitutionalCommitteeKeyHash:
    case VoterKind.ConstitutionalCommitteeScriptHash:
      return voter.toConstitutionalCommitteeHotCred()!;
    case VoterKind.DrepKeyHash:
    case VoterKind.DRepScriptHash:
      return voter.toDrepCred()!;
    case VoterKind.StakePoolKeyHash:
      return {
        type: CredentialType.KeyHash,
        hash: voter.toStakingPoolKeyHash()! as unknown as CredentialCore["hash"],
      };
    default:
      throw new Error(`Unsupported voter kind: ${voter.kind()}`);
  }
};

const voterRank = (voter: Serialization.Voter): number => {
  switch (voter.kind()) {
    case VoterKind.ConstitutionalCommitteeKeyHash:
    case VoterKind.ConstitutionalCommitteeScriptHash:
      return 0;
    case VoterKind.DrepKeyHash:
    case VoterKind.DRepScriptHash:
      return 1;
    default:
      return 2;
  }
};

/** The order the ledger keeps voters in: committee, DReps, pools; script credentials first */
const compareVoters = (
  a: Serialization.Voter,
  b: Serialization.Voter,
): number =>
  voterRank(a) - voterRank(b) ||
  compareCredentials(voterCredential(a), voterCredential(b));

const toMeshVoter = (voter: Serialization.Voter): Voter => {
  switch (voter.kind()) {
    case VoterKind.ConstitutionalCommitteeKeyHash:
    case VoterKind.ConstitutionalCommitteeScriptHash: {
      const credential = voter.toConstitutionalCommitteeHotCred()!;
      return {
        type: "ConstitutionalCommittee",
        hotCred:
          credential.type === CredentialType.ScriptHash
            ? { type: "ScriptHash", scriptHash: credential.hash.toString() }
            : { type: "KeyHash", keyHash: credential.hash.toString() },
      };
    }
    case VoterKind.DrepKeyHash:
    case VoterKind.DRepScriptHash:
      return {
        type: "DRep",
        drepId: DRepID.cip129FromCredential(voter.toDrepCred()!),
      };
    case VoterKind.StakePoolKeyHash:
      return {
        type: "StakingPool",
        keyHash: voter.toStakingPoolKeyHash()!.toString(),
      };
    default:
      throw new Error(`Unsupported voter kind: ${voter.kind()}`);
  }
};

const toMeshVoteKind = (vote: Cardano.Vote): VoteKind => {
  switch (vote) {
    case Cardano.Vote.yes:
      return "Yes";
    case Cardano.Vote.no:
      return "No";
    default:
      return "Abstain";
  }
};

export const parseVotes = (ctx: TxParserContext): Vote[] => {
  const procedures = ctx.body.votingProcedures();
  if (!procedures) return [];

  const votes: Vote[] = [];
  // Voting redeemer indexes refer to the position of the voter in the ledger's ordering
  // of the voting procedures, whatever order they were encoded in
  const voters = [...procedures.getVoters()].sort(compareVoters);
  voters.forEach((voter, voterIndex) => {
    const meshVoter = toMeshVoter(voter);
    const credential = voterCredential(voter);
    const isScript = credential.type === CredentialType.ScriptHash;
    const witness = ctx.scriptWitnessFor(
      credential,
      RedeemerTag.Voting,
      voterIndex,
    );

    for (const actionId of procedures.getGovernanceActionIdsByVoter(voter)) {
      const procedure = procedures.get(voter, actionId);
      if (!procedure) continue;

      const votingProcedure: VotingProcedure = {
        voteKind: toMeshVoteKind(procedure.vote()),
      };
      const anchor = procedure.anchor();
      if (anchor) {
        votingProcedure.anchor = {
          anchorUrl: anchor.url(),
          anchorDataHash: anchor.dataHash().toString(),
        };
      }
      const vote: VoteType = {
        voter: meshVoter,
        govActionId: {
          txHash: actionId.transactionId().toString(),
          txIndex: Number(actionId.index()),
        },
        votingProcedure,
      };

      if (!isScript) {
        votes.push({ type: "BasicVote", vote });
      } else if (witness.redeemer || witness.plutusSource) {
        const scriptVote: ScriptVote = { type: "ScriptVote", vote };
        if (witness.redeemer) scriptVote.redeemer = witness.redeemer;
        if (witness.plutusSource)
          scriptVote.scriptSource = witness.plutusSource;
        votes.push(scriptVote);
      } else if (witness.simpleSource) {
        votes.push({
          type: "SimpleScriptVote",
          vote,
          simpleScriptSource: witness.simpleSource,
        });
      } else {
        // Script voter whose script is neither in the witness set nor in a resolved
        // reference input: keep the vote, the witness has to be supplied by the caller.
        votes.push({ type: "ScriptVote", vote });
      }
    }
  });
  return votes;
};
