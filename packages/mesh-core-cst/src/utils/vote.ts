import { Cardano, Serialization } from "@cardano-sdk/core";

import {
  Anchor,
  RefTxIn,
  VoteKind,
  Voter,
  VotingProcedure,
} from "@meshsdk/common";

import {
  CredentialCore,
  Ed25519KeyHashHex,
  Hash28ByteBase16,
  Hash32ByteBase16,
} from "../types";
import { toDRep } from "./converter";

export const toCardanoVoter = (voter: Voter): Serialization.Voter => {
  switch (voter.type) {
    case "ConstitutionalCommittee": {
      switch (voter.hotCred.type) {
        case "KeyHash": {
          return Serialization.Voter.newConstitutionalCommitteeHotKey({
            type: 0,
            hash: Hash28ByteBase16(voter.hotCred.keyHash),
          });
        }
        case "ScriptHash": {
          return Serialization.Voter.newConstitutionalCommitteeHotKey({
            type: 1,
            hash: Hash28ByteBase16(voter.hotCred.scriptHash),
          });
        }
      }
    }
    case "DRep": {
      const cardanoDrep = toDRep(voter.drepId);
      if (cardanoDrep.toKeyHash() !== undefined) {
        return Serialization.Voter.newDrep({
          type: 0,
          hash: Hash28ByteBase16(cardanoDrep.toKeyHash()!),
        });
      } else if (cardanoDrep.toScriptHash() !== undefined) {
        return Serialization.Voter.newDrep({
          type: 1,
          hash: Hash28ByteBase16(cardanoDrep.toScriptHash()!),
        });
      } else {
        throw new Error("Invalid DRep provided");
      }
    }
    case "StakingPool": {
      return Serialization.Voter.newStakingPool(
        Ed25519KeyHashHex(voter.keyHash),
      );
    }
  }
};

export const toCardanoVotingProcedure = (
  votingProcedure: VotingProcedure,
): Serialization.VotingProcedure => {
  return new Serialization.VotingProcedure(
    toCardanoVoteKind(votingProcedure.voteKind),
    votingProcedure.anchor
      ? toCardanoAnchor(votingProcedure.anchor)
      : undefined,
  );
};

const toCardanoAnchor = (anchor: Anchor): Serialization.Anchor => {
  return new Serialization.Anchor(
    anchor.anchorUrl,
    Hash32ByteBase16(anchor.anchorDataHash),
  );
};

const toCardanoVoteKind = (voteType: VoteKind): Cardano.Vote => {
  switch (voteType) {
    case "Yes": {
      return 1;
    }
    case "No": {
      return 0;
    }
    case "Abstain": {
      return 2;
    }
  }
};

export const toCardanoGovernanceActionId = (
  govActionId: RefTxIn,
): Serialization.GovernanceActionId => {
  return new Serialization.GovernanceActionId(
    Cardano.TransactionId(govActionId.txHash),
    BigInt(govActionId.txIndex),
  );
};

/** The order the ledger keeps credentials in: script credentials first, then by hash */
export const compareCredentials = (
  a: CredentialCore,
  b: CredentialCore,
): number => {
  if (a.type !== b.type) {
    return a.type === Cardano.CredentialType.ScriptHash ? -1 : 1;
  }
  return a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0;
};

/** The credential that witnesses the votes of a voter (the pool key for SPOs) */
export const voterCredential = (voter: Serialization.Voter): CredentialCore => {
  switch (voter.kind()) {
    case Serialization.VoterKind.ConstitutionalCommitteeKeyHash:
    case Serialization.VoterKind.ConstitutionalCommitteeScriptHash:
      return voter.toConstitutionalCommitteeHotCred()!;
    case Serialization.VoterKind.DrepKeyHash:
    case Serialization.VoterKind.DRepScriptHash:
      return voter.toDrepCred()!;
    case Serialization.VoterKind.StakePoolKeyHash:
      return {
        type: Cardano.CredentialType.KeyHash,
        hash: Hash28ByteBase16(voter.toStakingPoolKeyHash()!),
      };
    default:
      throw new Error(`Unsupported voter kind: ${voter.kind()}`);
  }
};

const voterRank = (voter: Serialization.Voter): number => {
  switch (voter.kind()) {
    case Serialization.VoterKind.ConstitutionalCommitteeKeyHash:
    case Serialization.VoterKind.ConstitutionalCommitteeScriptHash:
      return 0;
    case Serialization.VoterKind.DrepKeyHash:
    case Serialization.VoterKind.DRepScriptHash:
      return 1;
    default:
      return 2;
  }
};

/**
 * The order the ledger keeps voters in, which is the order voting redeemers are indexed by:
 * committee members, then DReps, then pools; script credentials before key hashes
 */
export const compareVoters = (
  a: Serialization.Voter,
  b: Serialization.Voter,
): number =>
  voterRank(a) - voterRank(b) ||
  compareCredentials(voterCredential(a), voterCredential(b));
