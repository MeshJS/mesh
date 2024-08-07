import { PoolParams } from "../pool-params";
import { Redeemer } from "./data";
import { ScriptSource, SimpleScriptSourceInfo } from "./script";

export type Certificate =
  | { type: "BasicCertificate"; certType: CertificateType }
  | {
      type: "ScriptCertificate";
      certType: CertificateType;
      redeemer?: Redeemer;
      scriptSource?: ScriptSource;
    }
  | {
      type: "SimpleScriptCertificate";
      certType: CertificateType;
      simpleScriptSource?: SimpleScriptSourceInfo;
    };

export type CertificateType =
  | { type: "RegisterPool"; poolParams: PoolParams }
  | { type: "RegisterStake"; stakeKeyHash: string }
  | { type: "DelegateStake"; stakeKeyHash: string; poolId: string }
  | { type: "DeregisterStake"; stakeKeyHash: string }
  | { type: "RetirePool"; poolId: string; epoch: number }
  | { type: "VoteDelegation"; stakeKeyHash: string; drep: DRep }
  | {
      type: "StakeAndVoteDelegation";
      stakeKeyHash: string;
      poolKeyHash: string;
      drep: DRep;
    }
  | {
      type: "StakeRegistrationAndDelegation";
      stakeKeyHash: string;
      poolKeyHash: string;
      coin: number;
    }
  | {
      type: "VoteRegistrationAndDelegation";
      stakeKeyHash: string;
      drep: DRep;
      coin: number;
    }
  | {
      type: "StakeVoteRegistrationAndDelegation";
      stakeKeyHash: string;
      poolKeyHash: string;
      drep: DRep;
      coin: number;
    }
  | {
      type: "CommitteeHotAuth";
      committeeColdKeyHash: string;
      committeeHotKeyHash: string;
    }
  | {
      type: "CommitteeColdResign";
      committeeColdKeyHash: string;
      anchor?: Anchor;
    }
  | {
      type: "DRepRegistration";
      votingKeyHash: string;
      coin: number;
      anchor?: Anchor;
    }
  | {
      type: "DRepDeregistration";
      votingKeyHash: string;
      coin: number;
    }
  | {
      type: "DRepUpdate";
      votingKeyHash: string;
      anchor: Anchor;
    };

export type DRep =
  | { keyHash: string }
  | { scriptHash: string }
  | {
      alwaysAbstain: {};
    }
  | {
      alwaysNoConfidence: {};
    };

export type Anchor = {
  anchorUrl: string;
  anchorDataHash: string;
};
