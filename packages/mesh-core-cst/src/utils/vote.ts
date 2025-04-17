import { Cardano, Serialization } from "@cardano-sdk/core";

import {
  Anchor,
  RefTxIn,
  VoteKind,
  Voter,
  VotingProcedure,
} from "@meshsdk/common";

import {
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
