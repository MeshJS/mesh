import { Cardano } from "@cardano-sdk/core";

import type { CertificatePrototype, PoolParamsPrototype, RelayPrototype } from "@meshsdk/common";

import { Certificate } from "../types";
import { anchorToPrototype, credentialToPrototype, dRepToPrototype, fractionToPrototype } from "./primitives";

const relayToPrototype = (relay: Cardano.Relay): RelayPrototype => {
  const r = relay as {
    __typename: string;
    ipv4?: string | null;
    ipv6?: string | null;
    port?: number | null;
    hostname?: string;
    dnsName?: string;
  };
  switch (r.__typename) {
    case "RelayByAddress":
      return {
        type: "SINGLE_HOST_ADDR",
        value: {
          ipv4: r.ipv4 ? (r.ipv4.split(".").map(Number) as [number, number, number, number]) : null,
          ipv6: r.ipv6 ? (Buffer.from(r.ipv6.replace(/:/g, ""), "hex").toJSON().data as number[] as never) : null,
          port: r.port ?? null,
        },
      };
    case "RelayByName":
      return { type: "SINGLE_HOST_NAME", value: { dns_name: r.hostname!, port: r.port ?? null } };
    case "RelayByNameMultihost":
      return { type: "MULTI_HOST_NAME", value: { dns_name: r.dnsName ?? r.hostname! } };
    default:
      throw new Error(`Unsupported relay typename: ${r.__typename}`);
  }
};

/**
 * `Cardano.PoolParameters` re-encodes two fields into bech32 that the prototype carries as raw
 * hex, so they must be decoded back or the result cannot be re-encoded:
 *   - `id` is a `PoolId` ("pool1…"), built by `PoolParams.toCore()` via `PoolId.fromKeyHash`;
 *     the prototype's `operator` is the bare 28-byte key hash.
 *   - `owners` are `RewardAccount`s ("stake_test1…"), built via `createRewardAccount`; the
 *     prototype's `pool_owners` are bare key hashes.
 * Passing the bech32 forms straight through made a decoded POOL_REGISTRATION un-re-encodable
 * ("expected length '56', got 64"), which is now covered by a round-trip test.
 */
const poolParamsToPrototype = (p: Cardano.PoolParameters): PoolParamsPrototype => ({
  operator: Cardano.PoolId.toKeyHash(p.id).toString(),
  vrf_keyhash: p.vrf.toString(),
  pledge: p.pledge.toString(),
  cost: p.cost.toString(),
  margin: fractionToPrototype(p.margin),
  reward_account: p.rewardAccount.toString(),
  pool_owners: p.owners.map((o) => Cardano.RewardAccount.toHash(o).toString()),
  relays: p.relays.map(relayToPrototype),
  pool_metadata: p.metadataJson
    ? { url: p.metadataJson.url, pool_metadata_hash: p.metadataJson.hash.toString() }
    : null,
});

/**
 * Inverse of `../tx-prototype-to-cbor/certificates.ts`, decoding straight from CST's core
 * certificate union rather than through Mesh's own `CertificateType`. That makes this direction
 * strictly less lossy than the encoder: the encoder must round-trip raw credentials through
 * bech32 reward addresses to reuse `toCardanoCert`, whereas here the raw credential is available
 * directly.
 *
 * Round-trip caveat: CDDL certs 0/1 (no deposit) and 7/8 (with deposit) are distinct, and Mesh's
 * `CertificateType` has no deposit-carrying registration variant, so the encoder always emits the
 * no-deposit form. A `STAKE_REGISTRATION` carrying a `coin` therefore comes back with `coin: null`.
 */
export const certificateToPrototype = (cert: Certificate): CertificatePrototype => {
  const core = cert.toCore();
  switch (core.__typename) {
    case Cardano.CertificateType.StakeRegistration:
      return {
        type: "STAKE_REGISTRATION",
        value: { stake_credential: credentialToPrototype(core.stakeCredential), coin: null },
      };
    case Cardano.CertificateType.StakeDeregistration:
      return {
        type: "STAKE_DEREGISTRATION",
        value: { stake_credential: credentialToPrototype(core.stakeCredential), coin: null },
      };
    case Cardano.CertificateType.Registration:
      return {
        type: "STAKE_REGISTRATION",
        value: {
          stake_credential: credentialToPrototype(core.stakeCredential),
          coin: core.deposit.toString(),
        },
      };
    case Cardano.CertificateType.Unregistration:
      return {
        type: "STAKE_DEREGISTRATION",
        value: {
          stake_credential: credentialToPrototype(core.stakeCredential),
          coin: core.deposit.toString(),
        },
      };
    case Cardano.CertificateType.StakeDelegation:
      return {
        type: "STAKE_DELEGATION",
        value: {
          stake_credential: credentialToPrototype(core.stakeCredential),
          pool_keyhash: Cardano.PoolId.toKeyHash(core.poolId).toString(),
        },
      };
    case Cardano.CertificateType.PoolRegistration:
      return {
        type: "POOL_REGISTRATION",
        value: { pool_params: poolParamsToPrototype(core.poolParameters) },
      };
    case Cardano.CertificateType.PoolRetirement:
      return {
        type: "POOL_RETIREMENT",
        value: {
          pool_keyhash: Cardano.PoolId.toKeyHash(core.poolId).toString(),
          epoch: BigInt(core.epoch),
        },
      };
    case Cardano.CertificateType.VoteDelegation:
      return {
        type: "VOTE_DELEGATION",
        value: {
          stake_credential: credentialToPrototype(core.stakeCredential),
          drep: dRepToPrototype(core.dRep),
        },
      };
    case Cardano.CertificateType.StakeVoteDelegation:
      return {
        type: "STAKE_AND_VOTE_DELEGATION",
        value: {
          stake_credential: credentialToPrototype(core.stakeCredential),
          pool_keyhash: Cardano.PoolId.toKeyHash(core.poolId).toString(),
          drep: dRepToPrototype(core.dRep),
        },
      };
    case Cardano.CertificateType.StakeRegistrationDelegation:
      return {
        type: "STAKE_REGISTRATION_AND_DELEGATION",
        value: {
          stake_credential: credentialToPrototype(core.stakeCredential),
          pool_keyhash: Cardano.PoolId.toKeyHash(core.poolId).toString(),
          coin: core.deposit.toString(),
        },
      };
    case Cardano.CertificateType.VoteRegistrationDelegation:
      return {
        type: "VOTE_REGISTRATION_AND_DELEGATION",
        value: {
          stake_credential: credentialToPrototype(core.stakeCredential),
          drep: dRepToPrototype(core.dRep),
          coin: core.deposit.toString(),
        },
      };
    case Cardano.CertificateType.StakeVoteRegistrationDelegation:
      return {
        type: "STAKE_VOTE_REGISTRATION_AND_DELEGATION",
        value: {
          stake_credential: credentialToPrototype(core.stakeCredential),
          pool_keyhash: Cardano.PoolId.toKeyHash(core.poolId).toString(),
          drep: dRepToPrototype(core.dRep),
          coin: core.deposit.toString(),
        },
      };
    case Cardano.CertificateType.AuthorizeCommitteeHot:
      return {
        type: "COMMITTEE_HOT_AUTH",
        value: {
          committee_cold_credential: credentialToPrototype(core.coldCredential),
          committee_hot_credential: credentialToPrototype(core.hotCredential),
        },
      };
    case Cardano.CertificateType.ResignCommitteeCold:
      return {
        type: "COMMITTEE_COLD_RESIGN",
        value: {
          committee_cold_credential: credentialToPrototype(core.coldCredential),
          anchor: core.anchor ? anchorToPrototype(core.anchor) : null,
        },
      };
    case Cardano.CertificateType.RegisterDelegateRepresentative:
      return {
        type: "DREP_REGISTRATION",
        value: {
          voting_credential: credentialToPrototype(core.dRepCredential),
          coin: core.deposit.toString(),
          anchor: core.anchor ? anchorToPrototype(core.anchor) : null,
        },
      };
    case Cardano.CertificateType.UnregisterDelegateRepresentative:
      return {
        type: "DREP_DEREGISTRATION",
        value: {
          voting_credential: credentialToPrototype(core.dRepCredential),
          coin: core.deposit.toString(),
        },
      };
    case Cardano.CertificateType.UpdateDelegateRepresentative:
      return {
        type: "DREP_UPDATE",
        value: {
          voting_credential: credentialToPrototype(core.dRepCredential),
          anchor: core.anchor ? anchorToPrototype(core.anchor) : null,
        },
      };
    default:
      throw new Error(
        `Certificate type ${core.__typename} has no TransactionPrototype equivalent (pre-Conway, unsupported)`,
      );
  }
};
