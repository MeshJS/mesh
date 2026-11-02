import { Cardano } from "@cardano-sdk/core";

import {
  Anchor,
  Certificate,
  CertificateType,
  DRep,
  PoolParams,
  Relay,
} from "@meshsdk/common";

import { CredentialCore, CredentialType, DRepID, RedeemerTag } from "../types";
import { TxParserContext } from "./context";

type ScriptCertificate = Extract<Certificate, { type: "ScriptCertificate" }>;
type SimpleScriptCertificate = Extract<
  Certificate,
  { type: "SimpleScriptCertificate" }
>;

/** Mesh addresses stake and committee credentials by their reward address */
const credentialToRewardAddress = (
  credential: CredentialCore,
  networkId: Cardano.NetworkId,
): string =>
  Cardano.RewardAccount.fromCredential(credential, networkId).toString();

const poolKeyHashOf = (poolId: Cardano.PoolId): string =>
  Cardano.PoolId.toKeyHash(poolId).toString();

const toMeshDRep = (dRep: Cardano.DelegateRepresentative): DRep => {
  if (Cardano.isDRepCredential(dRep)) {
    return { dRepId: DRepID.cip129FromCredential(dRep) };
  }
  if (Cardano.isDRepAlwaysNoConfidence(dRep)) {
    return { alwaysNoConfidence: null };
  }
  return { alwaysAbstain: null };
};

const toMeshAnchor = (anchor: Cardano.Anchor | null): Anchor | undefined =>
  anchor
    ? { anchorUrl: anchor.url, anchorDataHash: anchor.dataHash.toString() }
    : undefined;

const toMeshRelay = (relay: Cardano.Relay): Relay => {
  switch (relay.__typename) {
    case "RelayByAddress": {
      const result: Relay = { type: "SingleHostAddr" };
      if (relay.ipv4 !== undefined) result.IPV4 = relay.ipv4;
      if (relay.ipv6 !== undefined) result.IPV6 = relay.ipv6;
      if (relay.port !== undefined) result.port = relay.port;
      return result;
    }
    case "RelayByName": {
      const result: Relay = {
        type: "SingleHostName",
        domainName: relay.hostname,
      };
      if (relay.port !== undefined) result.port = relay.port;
      return result;
    }
    case "RelayByNameMultihost":
      return { type: "MultiHostName", domainName: relay.dnsName };
    default:
      throw new Error(`Unsupported relay type: ${JSON.stringify(relay)}`);
  }
};

const toMeshPoolParams = (params: Cardano.PoolParameters): PoolParams => {
  const result: PoolParams = {
    vrfKeyHash: params.vrf.toString(),
    operator: poolKeyHashOf(params.id),
    pledge: params.pledge.toString(),
    cost: params.cost.toString(),
    margin: [
      Number(params.margin.numerator),
      Number(params.margin.denominator),
    ],
    relays: params.relays.map(toMeshRelay),
    owners: params.owners.map((owner) =>
      Cardano.RewardAccount.toHash(owner).toString(),
    ),
    rewardAddress: params.rewardAccount.toString(),
  };
  if (params.metadataJson) {
    result.metadata = {
      URL: params.metadataJson.url,
      hash: params.metadataJson.hash.toString(),
    };
  }
  return result;
};

type DecodedCertificate = {
  certType: CertificateType;
  /** The credential that has to witness the certificate; undefined for pool certificates (witnessed by the operator key) */
  credential?: CredentialCore;
};

/** Inverse of `toCardanoCert`, working on the core representation of the certificate */
const decodeCertificate = (
  core: Cardano.Certificate,
  networkId: Cardano.NetworkId,
): DecodedCertificate => {
  const stake = (credential: CredentialCore) =>
    credentialToRewardAddress(credential, networkId);

  switch (core.__typename) {
    case Cardano.CertificateType.StakeRegistration:
      return {
        certType: {
          type: "RegisterStake",
          stakeKeyAddress: stake(core.stakeCredential),
        },
        credential: core.stakeCredential,
      };
    // The Conway `reg_cert` / `unreg_cert` state their deposit
    case Cardano.CertificateType.Registration:
      return {
        certType: {
          type: "RegisterStake",
          stakeKeyAddress: stake(core.stakeCredential),
          coin: Number(core.deposit),
        },
        credential: core.stakeCredential,
      };
    case Cardano.CertificateType.StakeDeregistration:
      return {
        certType: {
          type: "DeregisterStake",
          stakeKeyAddress: stake(core.stakeCredential),
        },
        credential: core.stakeCredential,
      };
    case Cardano.CertificateType.Unregistration:
      return {
        certType: {
          type: "DeregisterStake",
          stakeKeyAddress: stake(core.stakeCredential),
          coin: Number(core.deposit),
        },
        credential: core.stakeCredential,
      };
    case Cardano.CertificateType.StakeDelegation:
      return {
        certType: {
          type: "DelegateStake",
          stakeKeyAddress: stake(core.stakeCredential),
          poolId: poolKeyHashOf(core.poolId),
        },
        credential: core.stakeCredential,
      };
    case Cardano.CertificateType.PoolRegistration:
      return {
        certType: {
          type: "RegisterPool",
          poolParams: toMeshPoolParams(core.poolParameters),
        },
      };
    case Cardano.CertificateType.PoolRetirement:
      return {
        certType: {
          type: "RetirePool",
          poolId: poolKeyHashOf(core.poolId),
          epoch: Number(core.epoch),
        },
      };
    case Cardano.CertificateType.VoteDelegation:
      return {
        certType: {
          type: "VoteDelegation",
          stakeKeyAddress: stake(core.stakeCredential),
          drep: toMeshDRep(core.dRep),
        },
        credential: core.stakeCredential,
      };
    case Cardano.CertificateType.StakeVoteDelegation:
      return {
        certType: {
          type: "StakeAndVoteDelegation",
          stakeKeyAddress: stake(core.stakeCredential),
          poolKeyHash: poolKeyHashOf(core.poolId),
          drep: toMeshDRep(core.dRep),
        },
        credential: core.stakeCredential,
      };
    case Cardano.CertificateType.StakeRegistrationDelegation:
      return {
        certType: {
          type: "StakeRegistrationAndDelegation",
          stakeKeyAddress: stake(core.stakeCredential),
          poolKeyHash: poolKeyHashOf(core.poolId),
          coin: Number(core.deposit),
        },
        credential: core.stakeCredential,
      };
    case Cardano.CertificateType.VoteRegistrationDelegation:
      return {
        certType: {
          type: "VoteRegistrationAndDelegation",
          stakeKeyAddress: stake(core.stakeCredential),
          drep: toMeshDRep(core.dRep),
          coin: Number(core.deposit),
        },
        credential: core.stakeCredential,
      };
    case Cardano.CertificateType.StakeVoteRegistrationDelegation:
      return {
        certType: {
          type: "StakeVoteRegistrationAndDelegation",
          stakeKeyAddress: stake(core.stakeCredential),
          poolKeyHash: poolKeyHashOf(core.poolId),
          drep: toMeshDRep(core.dRep),
          coin: Number(core.deposit),
        },
        credential: core.stakeCredential,
      };
    case Cardano.CertificateType.AuthorizeCommitteeHot:
      return {
        certType: {
          type: "CommitteeHotAuth",
          committeeColdKeyAddress: stake(core.coldCredential),
          committeeHotKeyAddress: stake(core.hotCredential),
        },
        credential: core.coldCredential,
      };
    case Cardano.CertificateType.ResignCommitteeCold: {
      const certType: CertificateType = {
        type: "CommitteeColdResign",
        committeeColdKeyAddress: stake(core.coldCredential),
      };
      const anchor = toMeshAnchor(core.anchor);
      if (anchor) certType.anchor = anchor;
      return { certType, credential: core.coldCredential };
    }
    case Cardano.CertificateType.RegisterDelegateRepresentative: {
      const certType: CertificateType = {
        type: "DRepRegistration",
        drepId: DRepID.cip129FromCredential(core.dRepCredential),
        coin: Number(core.deposit),
      };
      const anchor = toMeshAnchor(core.anchor);
      if (anchor) certType.anchor = anchor;
      return { certType, credential: core.dRepCredential };
    }
    case Cardano.CertificateType.UnregisterDelegateRepresentative:
      return {
        certType: {
          type: "DRepDeregistration",
          drepId: DRepID.cip129FromCredential(core.dRepCredential),
          coin: Number(core.deposit),
        },
        credential: core.dRepCredential,
      };
    case Cardano.CertificateType.UpdateDelegateRepresentative: {
      const certType: CertificateType = {
        type: "DRepUpdate",
        drepId: DRepID.cip129FromCredential(core.dRepCredential),
      };
      const anchor = toMeshAnchor(core.anchor);
      if (anchor) certType.anchor = anchor;
      return { certType, credential: core.dRepCredential };
    }
    default:
      throw new Error(
        `Cannot parse transaction: certificate type ${core.__typename} is not supported`,
      );
  }
};

export const parseCertificates = (ctx: TxParserContext): Certificate[] =>
  (ctx.body.certs()?.values() ?? []).map((cert, index) => {
    const { certType, credential } = decodeCertificate(
      cert.toCore(),
      ctx.networkId,
    );
    if (!credential || credential.type !== CredentialType.ScriptHash) {
      return { type: "BasicCertificate", certType };
    }
    // Certificate redeemer indexes refer to the position in the certificate list
    const witness = ctx.scriptWitnessFor(credential, RedeemerTag.Cert, index);
    if (witness.redeemer || witness.plutusSource) {
      const certificate: ScriptCertificate = {
        type: "ScriptCertificate",
        certType,
      };
      if (witness.redeemer) certificate.redeemer = witness.redeemer;
      if (witness.plutusSource) certificate.scriptSource = witness.plutusSource;
      return certificate;
    }
    if (witness.simpleSource) {
      const certificate: SimpleScriptCertificate = {
        type: "SimpleScriptCertificate",
        certType,
        simpleScriptSource: witness.simpleSource,
      };
      return certificate;
    }
    // Script credential without any witness in the transaction (e.g. a plain stake
    // registration, which needs none): nothing to attach.
    return { type: "BasicCertificate", certType };
  });
