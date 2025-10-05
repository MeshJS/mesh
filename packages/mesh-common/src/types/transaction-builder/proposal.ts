import { Anchor } from "./certificate";
import { Redeemer } from "./data";
import { ScriptSource, SimpleScriptSourceInfo } from "./script";
import {
  GovernanceAction,
  RewardAddress,
} from "../governance";

export type ProposalType = {
  governanceAction: GovernanceAction;
  anchor: Anchor;
  rewardAccount: RewardAddress;
  deposit: string;
};

export type BasicProposal = {
  type: "BasicProposal";
  proposalType: ProposalType;
};

export type ScriptProposal = {
  type: "ScriptProposal";
  proposalType: ProposalType;
  redeemer?: Redeemer;
  scriptSource?: ScriptSource;
};

export type SimpleScriptProposal = {
  type: "SimpleScriptProposal";
  proposalType: ProposalType;
  simpleScriptSource?: SimpleScriptSourceInfo;
};

export type Proposal = BasicProposal | ScriptProposal | SimpleScriptProposal;

