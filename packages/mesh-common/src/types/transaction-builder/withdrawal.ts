import { PoolParams, poolParamsToObj } from "..";
import { Redeemer } from "./data";
import { ScriptSource } from "./script";

export type Certificate =
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

export type Withdrawal =
  | {
      pubKeyWithdrawal: {
        address: string;
        coin: string;
      };
    }
  | {
      plutusScriptWithdrawal: {
        address: string;
        coin: string;
        scriptSource?: ScriptSource;
        redeemer?: Redeemer;
      };
    };

export const certificateToObj = (certificate: Certificate): object => {
  switch (certificate.type) {
    case "RegisterPool":
      return {
        registerPool: {
          poolParams: poolParamsToObj(certificate.poolParams),
        },
      };
    case "RegisterStake":
      return {
        registerStake: {
          stakeKeyHash: certificate.stakeKeyHash,
        },
      };
    case "DelegateStake":
      return {
        delegateStake: {
          stakeKeyHash: certificate.stakeKeyHash,
          poolId: certificate.poolId,
        },
      };
    case "DeregisterStake":
      return {
        deregisterStake: {
          stakeKeyHash: certificate.stakeKeyHash,
        },
      };
    case "RetirePool":
      return {
        retirePool: {
          poolId: certificate.poolId,
          epoch: certificate.epoch,
        },
      };
    case "VoteDelegation":
      return {
        voteDelegation: {
          stakeKeyHash: certificate.stakeKeyHash,
          drep: certificate.drep,
        },
      };
    case "StakeAndVoteDelegation":
      return {
        stakeAndVoteDelegation: {
          stakeKeyHash: certificate.stakeKeyHash,
          poolKeyHash: certificate.poolKeyHash,
          drep: certificate.drep,
        },
      };
    case "StakeRegistrationAndDelegation":
      return {
        stakeRegistrationAndDelegation: {
          stakeKeyHash: certificate.stakeKeyHash,
          poolKeyHash: certificate.poolKeyHash,
          coin: certificate.coin,
        },
      };
    case "VoteRegistrationAndDelegation":
      return {
        voteRegistrationAndDelegation: {
          stakeKeyHash: certificate.stakeKeyHash,
          drep: certificate.drep,
          coin: certificate.coin,
        },
      };
    case "StakeVoteRegistrationAndDelegation":
      return {
        stakeVoteRegistrationAndDelegation: {
          stakeKeyHash: certificate.stakeKeyHash,
          poolKeyHash: certificate.poolKeyHash,
          drep: certificate.drep,
          coin: certificate.coin,
        },
      };
    case "CommitteeHotAuth":
      return {
        committeeHotAuth: {
          committeeColdKeyHash: certificate.committeeColdKeyHash,
          committeeHotKeyHash: certificate.committeeHotKeyHash,
        },
      };
    case "CommitteeColdResign":
      return {
        committeeColdResign: {
          committeeColdKeyHash: certificate.committeeColdKeyHash,
          anchor: certificate.anchor ?? null,
        },
      };

    case "DRepRegistration":
      return {
        dRepRegistration: {
          votingKeyHash: certificate.votingKeyHash,
          coin: certificate.coin,
          anchor: certificate.anchor ?? null,
        },
      };
    case "DRepDeregistration":
      return {
        dRepDeregistration: {
          votingKeyHash: certificate.votingKeyHash,
          coin: certificate.coin,
        },
      };
    case "DRepUpdate":
      return {
        dRepUpdate: {
          votingKeyHash: certificate.votingKeyHash,
          anchor: certificate.anchor,
        },
      };
  }
};
