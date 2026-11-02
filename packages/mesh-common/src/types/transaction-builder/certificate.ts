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
  // `coin` is the deposit stated by the Conway `reg_cert` / `unreg_cert`; without it the
  // legacy certificates, which leave the deposit implicit, are used
  | { type: "RegisterStake"; stakeKeyAddress: string; coin?: number }
  | { type: "DelegateStake"; stakeKeyAddress: string; poolId: string }
  | { type: "DeregisterStake"; stakeKeyAddress: string; coin?: number }
  | { type: "RetirePool"; poolId: string; epoch: number }
  | { type: "VoteDelegation"; stakeKeyAddress: string; drep: DRep }
  | {
      type: "StakeAndVoteDelegation";
      stakeKeyAddress: string;
      poolKeyHash: string;
      drep: DRep;
    }
  | {
      type: "StakeRegistrationAndDelegation";
      stakeKeyAddress: string;
      poolKeyHash: string;
      coin: number;
    }
  | {
      type: "VoteRegistrationAndDelegation";
      stakeKeyAddress: string;
      drep: DRep;
      coin: number;
    }
  | {
      type: "StakeVoteRegistrationAndDelegation";
      stakeKeyAddress: string;
      poolKeyHash: string;
      drep: DRep;
      coin: number;
    }
  | {
      type: "CommitteeHotAuth";
      committeeColdKeyAddress: string;
      committeeHotKeyAddress: string;
    }
  | {
      type: "CommitteeColdResign";
      committeeColdKeyAddress: string;
      anchor?: Anchor;
    }
  | {
      type: "DRepRegistration";
      drepId: string;
      coin: number;
      anchor?: Anchor;
    }
  | {
      type: "DRepDeregistration";
      drepId: string;
      coin: number;
    }
  | {
      type: "DRepUpdate";
      drepId: string;
      anchor?: Anchor;
    };

export type DRep =
  | { dRepId: string }
  | {
      alwaysAbstain: null;
    }
  | {
      alwaysNoConfidence: null;
    };

export type Anchor = {
  anchorUrl: string;
  anchorDataHash: string;
};
