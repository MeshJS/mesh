import { Anchor, Vote, VoteKind, VoteType } from "@meshsdk/common";

import { redeemerFromObj } from "./data";
import { scriptSourceFromObj, simpleScriptSourceFromObj } from "./script";

export const voteFromObj = (obj: any): Vote => {
  if ("basicVote" in obj) {
    return {
      type: "BasicVote",
      vote: voteTypeFromObj(obj.basicVote),
    };
  } else if ("scriptVote" in obj) {
    return {
      type: "ScriptVote",
      vote: voteTypeFromObj(obj.scriptVote.vote),
      redeemer: redeemerFromObj(obj.scriptVote.redeemer),
      scriptSource: scriptSourceFromObj(obj.scriptVote.scriptSource),
    };
  } else if ("simpleScriptVote" in obj) {
    return {
      type: "SimpleScriptVote",
      vote: voteTypeFromObj(obj.simpleScriptVote.vote),
      simpleScriptSource: simpleScriptSourceFromObj(
        obj.simpleScriptVote.simpleScriptSource,
      ),
    };
  }
  throw new Error("Invalid vote object structure");
};

const voteTypeFromObj = (obj: any): VoteType => {
  const voter = voterFromObj(obj);
  const votingProcedure = {
    voteKind: voteKindFromObj(obj.votingProcedure.voteKind),
    anchor:
      obj.votingProcedure.anchor === null
        ? undefined
        : (obj.votingProcedure.anchor as Anchor),
  };

  return {
    voter,
    votingProcedure,
    govActionId: obj.govActionId,
  };
};

const voterFromObj = (obj: any) => {
  if ("constitutionalCommitteeHotCred" in obj.voter) {
    const cred = obj.voter.constitutionalCommitteeHotCred;
    return {
      type: "ConstitutionalCommittee" as const,
      hotCred:
        "keyHash" in cred
          ? { type: "KeyHash" as const, keyHash: cred.keyHash }
          : { type: "ScriptHash" as const, scriptHash: cred.scriptHash },
    };
  } else if ("dRepId" in obj.voter) {
    return {
      type: "DRep" as const,
      drepId: obj.voter.dRepId,
    };
  } else if ("stakingPoolKeyHash" in obj.voter) {
    return {
      type: "StakingPool" as const,
      keyHash: obj.voter.stakingPoolKeyHash,
    };
  }
  throw new Error("Invalid voter object structure");
};

const voteKindFromObj = (voteKind: string): VoteKind => {
  switch (voteKind.toLowerCase()) {
    case "yes":
      return "Yes";
    case "no":
      return "No";
    case "abstain":
      return "Abstain";
    default:
      throw new Error("Invalid vote kind");
  }
};
