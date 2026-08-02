import type {
  Anchor,
  AnchorPrototype,
  CertificatePrototype,
  CertificateType,
  CredTypePrototype,
  PoolParams,
  PoolParamsPrototype,
  Relay,
  RelayPrototype,
} from "@meshsdk/common";

import { Certificate as CardanoCert } from "../types";
import { toCardanoCert } from "../utils/certificate";
import {
  credentialPrototypeToDRepIdBech32,
  credentialPrototypeToRewardAddressBech32,
  dRepPrototypeToMeshDRep,
} from "./primitives";

const anchorPrototypeToMesh = (anchor: AnchorPrototype): Anchor => ({
  anchorUrl: anchor.anchor_url,
  anchorDataHash: anchor.anchor_data_hash,
});

/** IPv4/IPv6 are 4/16-byte tuples in the prototype; CST/Mesh relays want them as strings. */
const ipv4ToString = (ip: [number, number, number, number]): string => ip.join(".");
const ipv6ToString = (ip: number[]): string =>
  Buffer.from(ip).toString("hex").replace(/(.{4})(?=.)/g, "$1:");

const relayPrototypeToMesh = (relay: RelayPrototype): Relay => {
  switch (relay.type) {
    case "SINGLE_HOST_ADDR":
      return {
        type: "SingleHostAddr",
        IPV4: relay.value.ipv4 ? ipv4ToString(relay.value.ipv4) : undefined,
        IPV6: relay.value.ipv6 ? ipv6ToString(relay.value.ipv6) : undefined,
        port: relay.value.port ?? undefined,
      };
    case "SINGLE_HOST_NAME":
      return {
        type: "SingleHostName",
        domainName: relay.value.dns_name,
        port: relay.value.port ?? undefined,
      };
    case "MULTI_HOST_NAME":
      return { type: "MultiHostName", domainName: relay.value.dns_name };
  }
};

const poolParamsPrototypeToMesh = (pool: PoolParamsPrototype): PoolParams => ({
  vrfKeyHash: pool.vrf_keyhash,
  operator: pool.operator,
  pledge: pool.pledge,
  cost: pool.cost,
  margin: [Number(pool.margin.numerator), Number(pool.margin.denominator)],
  relays: pool.relays.map(relayPrototypeToMesh),
  owners: pool.pool_owners,
  rewardAddress: pool.reward_account,
  metadata: pool.pool_metadata
    ? { URL: pool.pool_metadata.url, hash: pool.pool_metadata.pool_metadata_hash }
    : undefined,
});

/**
 * `CertificatePrototype` carries only the raw ledger credential (a hash), while Mesh's own
 * `CertificateType` (consumed by the already-tested `toCardanoCert`, `../utils/certificate.ts`)
 * expects bech32 reward-account/committee-address strings and CIP-105 DRep ids — both of which it
 * immediately re-derives the raw credential/hash from. Reconstructing those strings here (via
 * `networkId`) is the price of reusing that conversion path for all 13 certificate kinds it
 * supports, instead of re-deriving CST's ~13 certificate constructors independently.
 *
  * Note: when `STAKE_REGISTRATION`/`STAKE_DEREGISTRATION` carry an explicit `coin`
 * (the post-Conway `reg_cert`/`unreg_cert` deposit form), it is silently dropped and the legacy
 * no-deposit certificate is produced instead — `toCardanoCert`'s `RegisterStake`/`DeregisterStake`
 * cases have no deposit-carrying equivalent either, so this matches Mesh's existing behavior
 * rather than introducing a new loss, but it means a `TransactionPrototype` from a chain era that
 * relies on the explicit-deposit form will round-trip incorrectly here.
 */
export const certificatePrototypeToCardano = (
  cert: CertificatePrototype,
  networkId: 0 | 1,
): CardanoCert => {
  const rewardAddr = (cred: CredTypePrototype) =>
    credentialPrototypeToRewardAddressBech32(cred, networkId);

  let certType: CertificateType;
  switch (cert.type) {
    case "STAKE_REGISTRATION":
      certType = { type: "RegisterStake", stakeKeyAddress: rewardAddr(cert.value.stake_credential) };
      break;
    case "STAKE_DEREGISTRATION":
      certType = { type: "DeregisterStake", stakeKeyAddress: rewardAddr(cert.value.stake_credential) };
      break;
    case "STAKE_DELEGATION":
      certType = {
        type: "DelegateStake",
        stakeKeyAddress: rewardAddr(cert.value.stake_credential),
        poolId: cert.value.pool_keyhash,
      };
      break;
    case "POOL_REGISTRATION":
      certType = {
        type: "RegisterPool",
        poolParams: poolParamsPrototypeToMesh(cert.value.pool_params),
      };
      break;
    case "POOL_RETIREMENT":
      certType = {
        type: "RetirePool",
        poolId: cert.value.pool_keyhash,
        // Narrowing boundary: prototype carries the CDDL `epoch = uint .size 8` range as bigint;
        // Mesh's own `CertificateType.RetirePool.epoch` is `number`. Lossy only above 2^53 —
        // unreachable for a real epoch number (currently ~500).
        epoch: Number(cert.value.epoch),
      };
      break;
    case "COMMITTEE_HOT_AUTH":
      certType = {
        type: "CommitteeHotAuth",
        committeeColdKeyAddress: rewardAddr(cert.value.committee_cold_credential),
        committeeHotKeyAddress: rewardAddr(cert.value.committee_hot_credential),
      };
      break;
    case "COMMITTEE_COLD_RESIGN":
      certType = {
        type: "CommitteeColdResign",
        committeeColdKeyAddress: rewardAddr(cert.value.committee_cold_credential),
        anchor: cert.value.anchor ? anchorPrototypeToMesh(cert.value.anchor) : undefined,
      };
      break;
    case "DREP_REGISTRATION":
      certType = {
        type: "DRepRegistration",
        drepId: credentialPrototypeToDRepIdBech32(cert.value.voting_credential),
        coin: Number(cert.value.coin),
        anchor: cert.value.anchor ? anchorPrototypeToMesh(cert.value.anchor) : undefined,
      };
      break;
    case "DREP_DEREGISTRATION":
      certType = {
        type: "DRepDeregistration",
        drepId: credentialPrototypeToDRepIdBech32(cert.value.voting_credential),
        coin: Number(cert.value.coin),
      };
      break;
    case "DREP_UPDATE":
      certType = {
        type: "DRepUpdate",
        drepId: credentialPrototypeToDRepIdBech32(cert.value.voting_credential),
        anchor: cert.value.anchor ? anchorPrototypeToMesh(cert.value.anchor) : undefined,
      };
      break;
    case "VOTE_DELEGATION":
      certType = {
        type: "VoteDelegation",
        stakeKeyAddress: rewardAddr(cert.value.stake_credential),
        drep: dRepPrototypeToMeshDRep(cert.value.drep),
      };
      break;
    case "STAKE_AND_VOTE_DELEGATION":
      certType = {
        type: "StakeAndVoteDelegation",
        stakeKeyAddress: rewardAddr(cert.value.stake_credential),
        poolKeyHash: cert.value.pool_keyhash,
        drep: dRepPrototypeToMeshDRep(cert.value.drep),
      };
      break;
    case "STAKE_REGISTRATION_AND_DELEGATION":
      certType = {
        type: "StakeRegistrationAndDelegation",
        stakeKeyAddress: rewardAddr(cert.value.stake_credential),
        poolKeyHash: cert.value.pool_keyhash,
        coin: Number(cert.value.coin),
      };
      break;
    case "VOTE_REGISTRATION_AND_DELEGATION":
      certType = {
        type: "VoteRegistrationAndDelegation",
        stakeKeyAddress: rewardAddr(cert.value.stake_credential),
        drep: dRepPrototypeToMeshDRep(cert.value.drep),
        coin: Number(cert.value.coin),
      };
      break;
    case "STAKE_VOTE_REGISTRATION_AND_DELEGATION":
      certType = {
        type: "StakeVoteRegistrationAndDelegation",
        stakeKeyAddress: rewardAddr(cert.value.stake_credential),
        poolKeyHash: cert.value.pool_keyhash,
        drep: dRepPrototypeToMeshDRep(cert.value.drep),
        coin: Number(cert.value.coin),
      };
      break;
  }

  return toCardanoCert(certType);
};
