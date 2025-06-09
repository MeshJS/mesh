import {
  Certificate,
  CertificateType,
  PoolMetadata,
  PoolParams,
  Relay,
} from "@meshsdk/common";

import { redeemerFromObj } from "./data";
import { scriptSourceFromObj, simpleScriptSourceFromObj } from "./script";

export const certificateFromObj = (obj: any): Certificate => {
  if ("basicCertificate" in obj) {
    return {
      type: "BasicCertificate",
      certType: baseCertFromObj(obj.basicCertificate),
    };
  } else if ("scriptCertificate" in obj) {
    const certificate: Certificate = {
      type: "ScriptCertificate",
      certType: baseCertFromObj(obj.scriptCertificate.cert),
    };

    if (obj.scriptCertificate.redeemer) {
      certificate.redeemer = redeemerFromObj(obj.scriptCertificate.redeemer);
    }

    if (obj.scriptCertificate.scriptSource) {
      certificate.scriptSource = scriptSourceFromObj(
        obj.scriptCertificate.scriptSource,
      );
    }

    return certificate;
  } else if ("simpleScriptCertificate" in obj) {
    const certificate: Certificate = {
      type: "SimpleScriptCertificate",
      certType: baseCertFromObj(obj.simpleScriptCertificate.cert),
    };

    if (obj.simpleScriptCertificate.simpleScriptSource) {
      certificate.simpleScriptSource = simpleScriptSourceFromObj(
        obj.simpleScriptCertificate.simpleScriptSource,
      );
    }

    return certificate;
  }

  throw new Error(
    `certificateFromObj: Unknown certificate type in object: ${JSON.stringify(obj)}`,
  );
};

export const baseCertFromObj = (obj: any): CertificateType => {
  if ("registerPool" in obj) {
    return {
      type: "RegisterPool",
      poolParams: poolParamsFromObj(obj.registerPool.poolParams),
    };
  } else if ("registerStake" in obj) {
    return {
      type: "RegisterStake",
      stakeKeyAddress: obj.registerStake.stakeKeyAddress,
    };
  } else if ("delegateStake" in obj) {
    return {
      type: "DelegateStake",
      stakeKeyAddress: obj.delegateStake.stakeKeyAddress,
      poolId: obj.delegateStake.poolId,
    };
  } else if ("deregisterStake" in obj) {
    return {
      type: "DeregisterStake",
      stakeKeyAddress: obj.deregisterStake.stakeKeyAddress,
    };
  } else if ("retirePool" in obj) {
    return {
      type: "RetirePool",
      poolId: obj.retirePool.poolId,
      epoch: obj.retirePool.epoch,
    };
  } else if ("voteDelegation" in obj) {
    return {
      type: "VoteDelegation",
      stakeKeyAddress: obj.voteDelegation.stakeKeyAddress,
      drep: obj.voteDelegation.drep,
    };
  } else if ("stakeAndVoteDelegation" in obj) {
    return {
      type: "StakeAndVoteDelegation",
      stakeKeyAddress: obj.stakeAndVoteDelegation.stakeKeyAddress,
      poolKeyHash: obj.stakeAndVoteDelegation.poolKeyHash,
      drep: obj.stakeAndVoteDelegation.drep,
    };
  } else if ("stakeRegistrationAndDelegation" in obj) {
    return {
      type: "StakeRegistrationAndDelegation",
      stakeKeyAddress: obj.stakeRegistrationAndDelegation.stakeKeyAddress,
      poolKeyHash: obj.stakeRegistrationAndDelegation.poolKeyHash,
      coin: obj.stakeRegistrationAndDelegation.coin,
    };
  } else if ("voteRegistrationAndDelegation" in obj) {
    return {
      type: "VoteRegistrationAndDelegation",
      stakeKeyAddress: obj.voteRegistrationAndDelegation.stakeKeyAddress,
      drep: obj.voteRegistrationAndDelegation.drep,
      coin: obj.voteRegistrationAndDelegation.coin,
    };
  } else if ("stakeVoteRegistrationAndDelegation" in obj) {
    return {
      type: "StakeVoteRegistrationAndDelegation",
      stakeKeyAddress: obj.stakeVoteRegistrationAndDelegation.stakeKeyAddress,
      poolKeyHash: obj.stakeVoteRegistrationAndDelegation.poolKeyHash,
      drep: obj.stakeVoteRegistrationAndDelegation.drep,
      coin: obj.stakeVoteRegistrationAndDelegation.coin,
    };
  } else if ("committeeHotAuth" in obj) {
    return {
      type: "CommitteeHotAuth",
      committeeColdKeyAddress: obj.committeeHotAuth.committeeColdKeyAddress,
      committeeHotKeyAddress: obj.committeeHotAuth.committeeHotKeyAddress,
    };
  } else if ("committeeColdResign" in obj) {
    return {
      type: "CommitteeColdResign",
      committeeColdKeyAddress: obj.committeeColdResign.committeeColdKeyAddress,
      anchor: obj.committeeColdResign.anchor || undefined,
    };
  } else if ("dRepRegistration" in obj) {
    return {
      type: "DRepRegistration",
      drepId: obj.dRepRegistration.drepId,
      coin: obj.dRepRegistration.coin,
      anchor: obj.dRepRegistration.anchor || undefined,
    };
  } else if ("dRepDeregistration" in obj) {
    return {
      type: "DRepDeregistration",
      drepId: obj.dRepDeregistration.drepId,
      coin: obj.dRepDeregistration.coin,
    };
  } else if ("dRepUpdate" in obj) {
    return {
      type: "DRepUpdate",
      drepId: obj.dRepUpdate.drepId,
      anchor: obj.dRepUpdate.anchor,
    };
  }

  throw new Error(
    `baseCertFromObj: Unknown certificate type in object: ${JSON.stringify(obj)}`,
  );
};

// You'll also need a helper function to convert pool parameters
export const poolParamsFromObj = (obj: any): PoolParams => {
  return {
    vrfKeyHash: obj.vrfKeyHash,
    operator: obj.operator,
    pledge: obj.pledge,
    cost: obj.cost,
    margin: obj.margin,
    relays: obj.relays.map((relay: any) => relayFromObj(relay)),
    owners: obj.owners,
    rewardAddress: obj.rewardAddress,
    metadata: obj.metadata ? poolMetadataFromObj(obj.metadata) : undefined,
  };
};

export const poolMetadataFromObj = (obj: any): PoolMetadata => {
  return {
    URL: obj.url,
    hash: obj.metadata,
  };
};

export const relayFromObj = (obj: any): Relay => {
  if ("singleHostAddr" in obj) {
    return {
      type: "SingleHostAddr",
      IPV4: obj.singleHostAddr.ipv4,
      IPV6: obj.singleHostAddr.ipv6,
      port: obj.singleHostAddr.port,
    };
  } else if ("singleHostName" in obj) {
    return {
      type: "SingleHostName",
      domainName: obj.singleHostName.hostname,
      port: obj.singleHostName.port,
    };
  } else if ("multiHostName" in obj) {
    return {
      type: "MultiHostName",
      domainName: obj.multiHostName.dnsName,
    };
  }

  throw new Error(
    `relayFromObj: Unknown relay type in object: ${JSON.stringify(obj)}`,
  );
};
