import { Cardano, Serialization } from "@cardano-sdk/core";

import { CertificateType } from "@meshsdk/common";

import { Crypto, toDRep } from "..";
import {
  Certificate as CardanoCert,
  Ed25519KeyHashHex,
  Hash32ByteBase16,
} from "../types";

export const toCardanoCert = (cert: CertificateType): CardanoCert => {
  switch (cert.type) {
    case "RegisterPool": {
      let relays: Serialization.Relay[] = [];

      for (const relay of cert.poolParams.relays) {
        switch (relay.type) {
          case "SingleHostAddr": {
            relays.push(
              Serialization.Relay.newSingleHostAddr(
                new Serialization.SingleHostAddr(
                  relay.port,
                  relay.IPV4,
                  relay.IPV6,
                ),
              ),
            );
            break;
          }
          case "SingleHostName": {
            relays.push(
              Serialization.Relay.newSingleHostName(
                new Serialization.SingleHostName(relay.domainName, relay.port),
              ),
            );
            break;
          }
          case "MultiHostName": {
            relays.push(
              Serialization.Relay.newMultiHostName(
                new Serialization.MultiHostName(relay.domainName),
              ),
            );
            break;
          }
        }
      }

      let poolOwners: Serialization.CborSet<
        Crypto.Ed25519KeyHashHex,
        Serialization.Hash<Crypto.Ed25519KeyHashHex>
      > = Serialization.CborSet.fromCore([], Serialization.Hash.fromCore);

      let poolOwnersValues = [...poolOwners.values()];
      for (const poolOwner of cert.poolParams.owners) {
        poolOwnersValues.push(
          Serialization.Hash.fromCore(Ed25519KeyHashHex(poolOwner)),
        );
      }
      poolOwners.setValues(poolOwnersValues);

      const rewardAddress = Cardano.RewardAddress.fromAddress(
        Cardano.Address.fromBech32(cert.poolParams.rewardAddress),
      );

      if (rewardAddress === undefined) {
        throw new Error(
          "Error parsing reward address, it is expected to be in bech32 format",
        );
      }

      const metadata = cert.poolParams.metadata
        ? new Serialization.PoolMetadata(
            cert.poolParams.metadata.URL,
            Crypto.Hash32ByteBase16(cert.poolParams.metadata.hash),
          )
        : undefined;

      return CardanoCert.newPoolRegistration(
        new Serialization.PoolRegistration(
          new Serialization.PoolParams(
            Ed25519KeyHashHex(cert.poolParams.operator),
            Cardano.VrfVkHex(cert.poolParams.vrfKeyHash),
            BigInt(cert.poolParams.pledge),
            BigInt(cert.poolParams.cost),
            new Serialization.UnitInterval(
              BigInt(cert.poolParams.margin[0]),
              BigInt(cert.poolParams.margin[1]),
            ),
            rewardAddress,
            poolOwners,
            relays,
            metadata,
          ),
        ),
      );
    }
    case "RegisterStake": {
      const rewardAddress = Cardano.RewardAddress.fromAddress(
        Cardano.Address.fromBech32(cert.stakeKeyAddress),
      );

      if (rewardAddress === undefined) {
        throw new Error(
          "Error parsing reward address, it is expected to be in bech32 format",
        );
      }

      return CardanoCert.newStakeRegistration(
        new Serialization.StakeRegistration(
          rewardAddress.getPaymentCredential(),
        ),
      );
    }
    case "DelegateStake": {
      const rewardAddress = Cardano.RewardAddress.fromAddress(
        Cardano.Address.fromBech32(cert.stakeKeyAddress),
      );

      if (rewardAddress === undefined) {
        throw new Error(
          "Error parsing reward address, it is expected to be in bech32 format",
        );
      }

      return CardanoCert.newStakeDelegation(
        new Serialization.StakeDelegation(
          rewardAddress.getPaymentCredential(),
          cert.poolId.startsWith("pool1")
            ? Cardano.PoolId.toKeyHash(Cardano.PoolId(cert.poolId))
            : Ed25519KeyHashHex(cert.poolId),
        ),
      );
    }
    case "DeregisterStake": {
      const rewardAddress = Cardano.RewardAddress.fromAddress(
        Cardano.Address.fromBech32(cert.stakeKeyAddress),
      );

      if (rewardAddress === undefined) {
        throw new Error(
          "Error parsing reward address, it is expected to be in bech32 format",
        );
      }

      return CardanoCert.newStakeDeregistration(
        new Serialization.StakeDeregistration(
          rewardAddress.getPaymentCredential(),
        ),
      );
    }
    case "RetirePool": {
      return CardanoCert.newPoolRetirement(
        new Serialization.PoolRetirement(
          cert.poolId.startsWith("pool1")
            ? Cardano.PoolId.toKeyHash(Cardano.PoolId(cert.poolId))
            : Ed25519KeyHashHex(cert.poolId),
          Cardano.EpochNo(cert.epoch),
        ),
      );
    }
    case "VoteDelegation": {
      const rewardAddress = Cardano.RewardAddress.fromAddress(
        Cardano.Address.fromBech32(cert.stakeKeyAddress),
      );

      if (rewardAddress === undefined) {
        throw new Error(
          "Error parsing reward address, it is expected to be in bech32 format",
        );
      }

      if ((cert.drep as { dRepId: string }).dRepId !== undefined) {
        return CardanoCert.newVoteDelegationCert(
          new Serialization.VoteDelegation(
            rewardAddress.getPaymentCredential(),
            toDRep((cert.drep as { dRepId: string }).dRepId),
          ),
        );
      } else if (
        (cert.drep as { alwaysAbstain: null }).alwaysAbstain !== undefined
      ) {
        return CardanoCert.newVoteDelegationCert(
          new Serialization.VoteDelegation(
            rewardAddress.getPaymentCredential(),
            Serialization.DRep.newAlwaysAbstain(),
          ),
        );
      } else if (
        (cert.drep as { alwaysNoConfidence: null }).alwaysNoConfidence !==
        undefined
      ) {
        return CardanoCert.newVoteDelegationCert(
          new Serialization.VoteDelegation(
            rewardAddress.getPaymentCredential(),
            Serialization.DRep.newAlwaysNoConfidence(),
          ),
        );
      } else {
        throw new Error("Malformed DRep type");
      }
    }
    case "StakeAndVoteDelegation": {
      const rewardAddress = Cardano.RewardAddress.fromAddress(
        Cardano.Address.fromBech32(cert.stakeKeyAddress),
      );

      if (rewardAddress === undefined) {
        throw new Error(
          "Error parsing reward address, it is expected to be in bech32 format",
        );
      }

      if ((cert.drep as { dRepId: string }).dRepId !== undefined) {
        return CardanoCert.newStakeVoteDelegationCert(
          new Serialization.StakeVoteDelegation(
            rewardAddress.getPaymentCredential(),
            toDRep((cert.drep as { dRepId: string }).dRepId),
            Ed25519KeyHashHex(cert.poolKeyHash),
          ),
        );
      } else if (
        (cert.drep as { alwaysAbstain: null }).alwaysAbstain !== undefined
      ) {
        return CardanoCert.newStakeVoteDelegationCert(
          new Serialization.StakeVoteDelegation(
            rewardAddress.getPaymentCredential(),
            Serialization.DRep.newAlwaysAbstain(),
            Ed25519KeyHashHex(cert.poolKeyHash),
          ),
        );
      } else if (
        (cert.drep as { alwaysNoConfidence: null }).alwaysNoConfidence !==
        undefined
      ) {
        return CardanoCert.newStakeVoteDelegationCert(
          new Serialization.StakeVoteDelegation(
            rewardAddress.getPaymentCredential(),
            Serialization.DRep.newAlwaysNoConfidence(),
            Ed25519KeyHashHex(cert.poolKeyHash),
          ),
        );
      } else {
        throw new Error("Malformed DRep type");
      }
    }
    case "StakeRegistrationAndDelegation": {
      const rewardAddress = Cardano.RewardAddress.fromAddress(
        Cardano.Address.fromBech32(cert.stakeKeyAddress),
      );

      if (rewardAddress === undefined) {
        throw new Error(
          "Error parsing reward address, it is expected to be in bech32 format",
        );
      }

      return CardanoCert.newStakeRegistrationDelegationCert(
        new Serialization.StakeRegistrationDelegation(
          rewardAddress.getPaymentCredential(),
          BigInt(cert.coin),
          Ed25519KeyHashHex(cert.poolKeyHash),
        ),
      );
    }
    case "VoteRegistrationAndDelegation": {
      const rewardAddress = Cardano.RewardAddress.fromAddress(
        Cardano.Address.fromBech32(cert.stakeKeyAddress),
      );

      if (rewardAddress === undefined) {
        throw new Error(
          "Error parsing reward address, it is expected to be in bech32 format",
        );
      }

      if ((cert.drep as { dRepId: string }).dRepId !== undefined) {
        return CardanoCert.newVoteRegistrationDelegationCert(
          new Serialization.VoteRegistrationDelegation(
            rewardAddress.getPaymentCredential(),
            BigInt(cert.coin),
            toDRep((cert.drep as { dRepId: string }).dRepId),
          ),
        );
      } else if (
        (cert.drep as { alwaysAbstain: null }).alwaysAbstain !== undefined
      ) {
        return CardanoCert.newVoteRegistrationDelegationCert(
          new Serialization.VoteRegistrationDelegation(
            rewardAddress.getPaymentCredential(),
            BigInt(cert.coin),
            Serialization.DRep.newAlwaysAbstain(),
          ),
        );
      } else if (
        (cert.drep as { alwaysNoConfidence: null }).alwaysNoConfidence !==
        undefined
      ) {
        return CardanoCert.newVoteRegistrationDelegationCert(
          new Serialization.VoteRegistrationDelegation(
            rewardAddress.getPaymentCredential(),
            BigInt(cert.coin),
            Serialization.DRep.newAlwaysNoConfidence(),
          ),
        );
      } else {
        throw new Error("Malformed DRep type");
      }
    }
    case "StakeVoteRegistrationAndDelegation": {
      const rewardAddress = Cardano.RewardAddress.fromAddress(
        Cardano.Address.fromBech32(cert.stakeKeyAddress),
      );

      if (rewardAddress === undefined) {
        throw new Error(
          "Error parsing reward address, it is expected to be in bech32 format",
        );
      }

      if ((cert.drep as { dRepId: string }).dRepId !== undefined) {
        return CardanoCert.newStakeVoteDelegationCert(
          new Serialization.StakeVoteDelegation(
            rewardAddress.getPaymentCredential(),
            toDRep((cert.drep as { dRepId: string }).dRepId),
            Ed25519KeyHashHex(cert.poolKeyHash),
          ),
        );
      } else if (
        (cert.drep as { alwaysAbstain: null }).alwaysAbstain !== undefined
      ) {
        return CardanoCert.newStakeVoteDelegationCert(
          new Serialization.StakeVoteDelegation(
            rewardAddress.getPaymentCredential(),
            Serialization.DRep.newAlwaysAbstain(),
            Ed25519KeyHashHex(cert.poolKeyHash),
          ),
        );
      } else if (
        (cert.drep as { alwaysNoConfidence: null }).alwaysNoConfidence !==
        undefined
      ) {
        return CardanoCert.newStakeVoteDelegationCert(
          new Serialization.StakeVoteDelegation(
            rewardAddress.getPaymentCredential(),
            Serialization.DRep.newAlwaysNoConfidence(),
            Ed25519KeyHashHex(cert.poolKeyHash),
          ),
        );
      } else {
        throw new Error("Malformed DRep type");
      }
    }
    case "CommitteeHotAuth": {
      const hotCred = Cardano.Address.fromBech32(
        cert.committeeHotKeyAddress,
      ).getProps().paymentPart;
      const coldCred = Cardano.Address.fromBech32(
        cert.committeeColdKeyAddress,
      ).getProps().paymentPart;
      if (!hotCred || !coldCred) {
        throw new Error("Malformed hot/cold credential");
      }
      return CardanoCert.newAuthCommitteeHotCert(
        new Serialization.AuthCommitteeHot(coldCred, hotCred),
      );
    }
    case "CommitteeColdResign": {
      const coldCred = Cardano.Address.fromBech32(
        cert.committeeColdKeyAddress,
      ).getProps().paymentPart;
      if (!coldCred) {
        throw new Error("Malformed hot/cold credential");
      }
      let anchor: Serialization.Anchor | undefined = undefined;
      if (cert.anchor) {
        anchor = new Serialization.Anchor(
          cert.anchor.anchorUrl,
          Hash32ByteBase16(cert.anchor.anchorDataHash),
        );
      }
      return CardanoCert.newResignCommitteeColdCert(
        new Serialization.ResignCommitteeCold(coldCred, anchor),
      );
    }
    case "DRepRegistration": {
      let anchor: Serialization.Anchor | undefined = undefined;
      if (cert.anchor) {
        anchor = new Serialization.Anchor(
          cert.anchor.anchorUrl,
          Hash32ByteBase16(cert.anchor.anchorDataHash),
        );
      }

      const coreDRep = toDRep(cert.drepId).toCore();
      if (Cardano.isDRepCredential(coreDRep)) {
        return CardanoCert.newRegisterDelegateRepresentativeCert(
          new Serialization.RegisterDelegateRepresentative(
            coreDRep,
            BigInt(cert.coin),
            anchor,
          ),
        );
      } else {
        throw new Error("DRepId must be a Credential");
      }
    }
    case "DRepDeregistration": {
      const coreDRep = toDRep(cert.drepId).toCore();
      if (Cardano.isDRepCredential(coreDRep)) {
        return CardanoCert.newUnregisterDelegateRepresentativeCert(
          new Serialization.UnregisterDelegateRepresentative(
            coreDRep,
            BigInt(cert.coin),
          ),
        );
      } else {
        throw new Error("DRepId must be a Credential");
      }
    }
    case "DRepUpdate": {
      let anchor: Serialization.Anchor | undefined = undefined;
      if (cert.anchor) {
        anchor = new Serialization.Anchor(
          cert.anchor.anchorUrl,
          Hash32ByteBase16(cert.anchor.anchorDataHash),
        );
      }

      const coreDRep = toDRep(cert.drepId).toCore();
      if (Cardano.isDRepCredential(coreDRep)) {
        return CardanoCert.newUpdateDelegateRepresentativeCert(
          new Serialization.UpdateDelegateRepresentative(coreDRep, anchor),
        );
      } else {
        throw new Error("DRepId must be a Credential");
      }
    }
  }
};
