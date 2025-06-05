import { Certificate } from "@meshsdk/common";

import { redeemerFromObj } from "./data";
import { scriptSourceFromObj } from "./script";

export const certificateFromObj = (obj: any): Certificate => {
  if ("stakeRegistration" in obj) {
    return {
      type: "StakeRegistration",
      stakeCredential: obj.stakeRegistration.stakeCredential,
    };
  } else if ("stakeDeregistration" in obj) {
    return {
      type: "StakeDeregistration",
      stakeCredential: obj.stakeDeregistration.stakeCredential,
    };
  } else if ("stakeDelegation" in obj) {
    return {
      type: "StakeDelegation",
      stakeCredential: obj.stakeDelegation.stakeCredential,
      poolKeyHash: obj.stakeDelegation.poolKeyHash,
    };
  } else if ("poolRegistration" in obj) {
    return {
      type: "PoolRegistration",
      poolParameters: obj.poolRegistration.poolParameters,
    };
  } else if ("poolRetirement" in obj) {
    return {
      type: "PoolRetirement",
      poolKeyHash: obj.poolRetirement.poolKeyHash,
      epoch: obj.poolRetirement.epoch,
    };
  } else if ("genesisKeyDelegation" in obj) {
    return {
      type: "GenesisKeyDelegation",
      genesisHash: obj.genesisKeyDelegation.genesisHash,
      genesisDelegateHash: obj.genesisKeyDelegation.genesisDelegateHash,
      vrfKeyHash: obj.genesisKeyDelegation.vrfKeyHash,
    };
  } else if ("moveInstantaneousRewardsCert" in obj) {
    return {
      type: "MoveInstantaneousRewardsCert",
      moveInstantaneousReward:
        obj.moveInstantaneousRewardsCert.moveInstantaneousReward,
    };
  } else if ("plutusScriptStakeDelegation" in obj) {
    const { stakeCredential, poolKeyHash, scriptSource, redeemer } =
      obj.plutusScriptStakeDelegation;

    return {
      type: "PlutusScriptStakeDelegation",
      stakeCredential,
      poolKeyHash,
      scriptSource: scriptSourceFromObj(scriptSource),
      redeemer: redeemerFromObj(redeemer),
    };
  } else if ("plutusScriptStakeDeregistration" in obj) {
    const { stakeCredential, scriptSource, redeemer } =
      obj.plutusScriptStakeDeregistration;

    return {
      type: "PlutusScriptStakeDeregistration",
      stakeCredential,
      scriptSource: scriptSourceFromObj(scriptSource),
      redeemer: redeemerFromObj(redeemer),
    };
  }

  throw new Error(
    `certificateFromObj: Unknown certificate type in object: ${JSON.stringify(obj)}`,
  );
};
