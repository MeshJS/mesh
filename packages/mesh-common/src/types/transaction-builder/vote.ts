import { Anchor } from "./certificate";
import { Redeemer } from "./data";
import { ScriptSource, SimpleScriptSourceInfo } from "./script";
import { RefTxIn } from "./txin";

export type Vote = BasicVote | ScriptVote | SimpleScriptVote;

export type BasicVote = {
  type: "BasicVote";
  vote: VoteType;
};

export type SimpleScriptVote = {
  type: "SimpleScriptVote";
  vote: VoteType;
  simpleScriptSource: SimpleScriptSourceInfo;
};

export type ScriptVote = {
  type: "ScriptVote";
  vote: VoteType;
  redeemer?: Redeemer;
  scriptSource?: ScriptSource;
};

export type VoteType = {
  voter: Voter;
  govActionId: RefTxIn;
  votingProcedure: VotingProcedure;
};

export type Voter =
  | {
      type: "ConstitutionalCommittee";
      hotAddress: string;
    }
  | {
      type: "DRep";
      drepId: string;
    }
  | {
      type: "StakingPool";
      keyHash: string;
    };

export type VotingProcedure = {
  voteKind: VoteKind;
  anchor?: Anchor;
};

export type VoteKind = "Yes" | "No" | "Abstain";
