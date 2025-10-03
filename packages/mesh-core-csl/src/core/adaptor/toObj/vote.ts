import { Vote, VoteType } from "@meshsdk/common";

import { redeemerToObj } from "./data";
import { scriptSourceToObj, simpleScriptSourceToObj } from "./script";

export const voteToObj = (vote: Vote): object => {
  if (vote.type === "BasicVote") {
    return {
      basicVote: voteTypeToObj(vote.vote),
    };
  } else if (vote.type === "ScriptVote") {
    if (!vote.scriptSource) {
      throw new Error("voteToObj: missing scriptSource in plutusScriptVote.");
    }
    if (!vote.redeemer) {
      throw new Error("voteToObj: missing redeemer in plutusScriptVote.");
    }

    return {
      scriptVote: {
        vote: voteTypeToObj(vote.vote),
        redeemer: redeemerToObj(vote.redeemer),
        scriptSource: scriptSourceToObj(vote.scriptSource),
      },
    };
  } else {
    if (!vote.simpleScriptSource) {
      throw new Error("voteToObj: missing script source in simpleScriptVote");
    }

    return {
      simpleScriptVote: {
        vote: voteTypeToObj(vote.vote),
        simpleScriptSource: simpleScriptSourceToObj(vote.simpleScriptSource),
      },
    };
  }
};

const voteTypeToObj = (voteType: VoteType) => {
  let voter = {};

  switch (voteType.voter.type) {
    case "ConstitutionalCommittee": {
      let ccCred = {};
      switch (voteType.voter.hotCred.type) {
        case "ScriptHash": {
          ccCred = {
            scriptHash: voteType.voter.hotCred.scriptHash,
          };
          break;
        }
        case "KeyHash": {
          ccCred = {
            keyHash: voteType.voter.hotCred.keyHash,
          };
          break;
        }
      }
      voter = {
        constitutionalCommitteeHotCred: ccCred,
      };
      break;
    }
    case "DRep": {
      voter = {
        dRepId: voteType.voter.drepId,
      };
      break;
    }
    case "StakingPool": {
      voter = {
        stakingPoolKeyHash: voteType.voter.keyHash,
      };
      break;
    }
  }

  let votingProcedure = {};
  switch (voteType.votingProcedure.voteKind) {
    case "Yes": {
      votingProcedure = {
        voteKind: "yes",
        anchor: voteType.votingProcedure.anchor ?? null,
      };
      break;
    }
    case "No": {
      votingProcedure = {
        voteKind: "no",
        anchor: voteType.votingProcedure.anchor ?? null,
      };
      break;
    }
    case "Abstain": {
      votingProcedure = {
        voteKind: "abstain",
        anchor: voteType.votingProcedure.anchor ?? null,
      };
      break;
    }
  }

  return {
    voter,
    votingProcedure,
    govActionId: voteType.govActionId,
  };
};
