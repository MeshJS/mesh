import {
  Certificate,
  CertificateType,
  PoolMetadata,
  PoolParams,
  Relay,
} from "@meshsdk/common";

import { redeemerToObj } from "./data";
import { scriptSourceToObj, simpleScriptSourceToObj } from "./script";

export const certificateToObj = (certificate: Certificate): object => {
  const baseCert = certificate.certType;
  switch (certificate.type) {
    case "BasicCertificate":
      return {
        basicCertificate: baseCertToObj(baseCert),
      };
    case "ScriptCertificate":
      return {
        scriptCertificate: {
          cert: baseCertToObj(baseCert),
          redeemer: certificate.redeemer
            ? redeemerToObj(certificate.redeemer)
            : null,
          scriptSource: certificate.scriptSource
            ? scriptSourceToObj(certificate.scriptSource)
            : null,
        },
      };
    case "SimpleScriptCertificate":
      return {
        simpleScriptCertificate: {
          cert: baseCertToObj(baseCert),
          simpleScriptSource: certificate.simpleScriptSource
            ? simpleScriptSourceToObj(certificate.simpleScriptSource)
            : null,
        },
      };
  }
};

export const baseCertToObj = (baseCert: CertificateType): object => {
  switch (baseCert.type) {
    case "RegisterPool":
      return {
        registerPool: {
          poolParams: poolParamsToObj(baseCert.poolParams),
        },
      };
    case "RegisterStake":
      return {
        registerStake: {
          stakeKeyAddress: baseCert.stakeKeyAddress,
          coin: 2000000, // TODO: change in conway era (this should become an argument)
        },
      };
    case "DelegateStake":
      return {
        delegateStake: {
          stakeKeyAddress: baseCert.stakeKeyAddress,
          poolId: baseCert.poolId,
        },
      };
    case "DeregisterStake":
      return {
        deregisterStake: {
          stakeKeyAddress: baseCert.stakeKeyAddress,
        },
      };
    case "RetirePool":
      return {
        retirePool: {
          poolId: baseCert.poolId,
          epoch: baseCert.epoch,
        },
      };
    case "VoteDelegation":
      return {
        voteDelegation: {
          stakeKeyAddress: baseCert.stakeKeyAddress,
          drep: baseCert.drep,
        },
      };
    case "StakeAndVoteDelegation":
      return {
        stakeAndVoteDelegation: {
          stakeKeyAddress: baseCert.stakeKeyAddress,
          poolKeyHash: baseCert.poolKeyHash,
          drep: baseCert.drep,
        },
      };
    case "StakeRegistrationAndDelegation":
      return {
        stakeRegistrationAndDelegation: {
          stakeKeyAddress: baseCert.stakeKeyAddress,
          poolKeyHash: baseCert.poolKeyHash,
          coin: baseCert.coin,
        },
      };
    case "VoteRegistrationAndDelegation":
      return {
        voteRegistrationAndDelegation: {
          stakeKeyAddress: baseCert.stakeKeyAddress,
          drep: baseCert.drep,
          coin: baseCert.coin,
        },
      };
    case "StakeVoteRegistrationAndDelegation":
      return {
        stakeVoteRegistrationAndDelegation: {
          stakeKeyAddress: baseCert.stakeKeyAddress,
          poolKeyHash: baseCert.poolKeyHash,
          drep: baseCert.drep,
          coin: baseCert.coin,
        },
      };
    case "CommitteeHotAuth":
      return {
        committeeHotAuth: {
          committeeColdKeyAddress: baseCert.committeeColdKeyAddress,
          committeeHotKeyAddress: baseCert.committeeHotKeyAddress,
        },
      };
    case "CommitteeColdResign":
      return {
        committeeColdResign: {
          committeeColdKeyAddress: baseCert.committeeColdKeyAddress,
          anchor: baseCert.anchor ?? null,
        },
      };

    case "DRepRegistration":
      return {
        dRepRegistration: {
          drepId: baseCert.drepId,
          coin: baseCert.coin,
          anchor: baseCert.anchor ?? null,
        },
      };
    case "DRepDeregistration":
      return {
        dRepDeregistration: {
          drepId: baseCert.drepId,
          coin: baseCert.coin,
        },
      };
    case "DRepUpdate":
      return {
        dRepUpdate: {
          drepId: baseCert.drepId,
          anchor: baseCert.anchor,
        },
      };
  }
};

export const poolParamsToObj = (poolParams: PoolParams): object => {
  return {
    vrfKeyHash: poolParams.vrfKeyHash,
    operator: poolParams.operator,
    pledge: poolParams.pledge,
    cost: poolParams.cost,
    margin: poolParams.margin,
    relays: poolParams.relays.map((relay) => relayToObj(relay)),
    owners: poolParams.owners,
    rewardAddress: poolParams.rewardAddress,
    metadata: poolParams.metadata
      ? poolMetadataToObj(poolParams.metadata)
      : undefined,
  };
};

export const poolMetadataToObj = (poolMetadata: PoolMetadata): object => {
  return {
    url: poolMetadata.URL,
    metadata: poolMetadata.hash,
  };
};

export const relayToObj = (relay: Relay): object => {
  switch (relay.type) {
    case "SingleHostAddr":
      return {
        singleHostAddr: {
          ipv4: relay.IPV4,
          ipv6: relay.IPV6,
          port: relay.port,
        },
      };
    case "SingleHostName":
      return {
        singleHostName: {
          hostname: relay.domainName,
          port: relay.port,
        },
      };
    case "MultiHostName":
      return {
        multiHostName: {
          dnsName: relay.domainName,
        },
      };
  }
};
