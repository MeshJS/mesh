import type {
  Ipv4Prototype,
  Ipv6Prototype,
  PoolParams,
  PoolParamsPrototype,
  Relay,
  RelayPrototype,
} from "@meshsdk/common";

import {
  toAnchor,
  toCredential,
  toCredentialWitness,
  toDeposit,
  toDRep,
  toDRepCredential,
  toPoolKeyHash,
  toPrototypeCredential,
} from "./credentials";
import {
  fail,
  freeze,
  isHash28,
  isHash32,
  labelOf,
  partContext,
  PartContext,
  toRewardAddress,
} from "./normalize";
import { shownValue } from "./shape";
import {
  AnchorInput,
  CertificateFragment,
  CertificatePart,
  CredentialInput,
  CredentialWitnessParams,
  DRepCredentialInput,
  DRepInput,
  PartParams,
  PoolInput,
} from "./types";

const build = (
  ctx: PartContext,
  certificate: CertificateFragment,
  witness: CertificatePart["witness"],
  depositParameter?: CertificatePart["depositParameter"],
): CertificatePart =>
  freeze({
    kind: "certificate",
    certificate,
    ...(depositParameter && { depositParameter }),
    witness,
    ...labelOf(ctx.label),
  });

const ctxOf = (params: unknown): PartContext =>
  partContext("certificate", params);

/** What `certificate.stakeRegistration` takes */
export interface StakeRegistrationParams extends CredentialWitnessParams {
  /** A reward address, or the credential */
  stake: CredentialInput;
  /** Lovelace deposited; the `keyDeposit` protocol parameter when omitted */
  deposit?: bigint;
}

/** What `certificate.stakeDeregistration` takes */
export interface StakeDeregistrationParams extends CredentialWitnessParams {
  /** A reward address, or the credential */
  stake: CredentialInput;
  /**
   * Lovelace refunded, which must be the deposit paid; the `keyDeposit` protocol parameter
   * when omitted
   */
  refund?: bigint;
}

/** What `certificate.legacyStakeRegistration` takes */
export interface LegacyStakeRegistrationParams extends PartParams {
  /** A reward address, or the credential */
  stake: CredentialInput;
}

/** What `certificate.legacyStakeDeregistration` takes */
export interface LegacyStakeDeregistrationParams extends CredentialWitnessParams {
  /** A reward address, or the credential */
  stake: CredentialInput;
}

/** What `certificate.stakeDelegation` takes */
export interface StakeDelegationParams extends CredentialWitnessParams {
  /** A reward address, or the credential */
  stake: CredentialInput;
  /** The pool id in bech32, or its key hash */
  pool: PoolInput;
}

/** What `certificate.voteDelegation` takes */
export interface VoteDelegationParams extends CredentialWitnessParams {
  /** A reward address, or the credential */
  stake: CredentialInput;
  /** A DRep id, its credential, `"alwaysAbstain"` or `"alwaysNoConfidence"` */
  drep: DRepInput;
}

/** What `certificate.stakeAndVoteDelegation` takes */
export interface StakeAndVoteDelegationParams extends CredentialWitnessParams {
  /** A reward address, or the credential */
  stake: CredentialInput;
  /** The pool id in bech32, or its key hash */
  pool: PoolInput;
  /** A DRep id, its credential, `"alwaysAbstain"` or `"alwaysNoConfidence"` */
  drep: DRepInput;
}

/** What `certificate.stakeRegistrationAndDelegation` takes */
export interface StakeRegistrationAndDelegationParams extends CredentialWitnessParams {
  /** A reward address, or the credential */
  stake: CredentialInput;
  /** The pool id in bech32, or its key hash */
  pool: PoolInput;
  /** Lovelace deposited; the `keyDeposit` protocol parameter when omitted */
  deposit?: bigint;
}

/** What `certificate.voteRegistrationAndDelegation` takes */
export interface VoteRegistrationAndDelegationParams extends CredentialWitnessParams {
  /** A reward address, or the credential */
  stake: CredentialInput;
  /** A DRep id, its credential, `"alwaysAbstain"` or `"alwaysNoConfidence"` */
  drep: DRepInput;
  /** Lovelace deposited; the `keyDeposit` protocol parameter when omitted */
  deposit?: bigint;
}

/** What `certificate.stakeVoteRegistrationAndDelegation` takes */
export interface StakeVoteRegistrationAndDelegationParams extends CredentialWitnessParams {
  /** A reward address, or the credential */
  stake: CredentialInput;
  /** The pool id in bech32, or its key hash */
  pool: PoolInput;
  /** A DRep id, its credential, `"alwaysAbstain"` or `"alwaysNoConfidence"` */
  drep: DRepInput;
  /** Lovelace deposited; the `keyDeposit` protocol parameter when omitted */
  deposit?: bigint;
}

/** What `certificate.poolRegistration` takes */
export interface PoolRegistrationParams extends PartParams {
  /** The pool's parameters; `rewardAddress` in bech32 or hex */
  params: PoolParams;
}

/** What `certificate.poolRetirement` takes */
export interface PoolRetirementParams extends PartParams {
  /** The pool id in bech32, or its key hash */
  pool: PoolInput;
  /** The epoch the pool retires at */
  epoch: bigint | number;
}

/** What `certificate.committeeHotAuth` takes */
export interface CommitteeHotAuthParams extends CredentialWitnessParams {
  /** The member's cold credential, or a reward address carrying it */
  cold: CredentialInput;
  /** The hot credential, or a reward address carrying it */
  hot: CredentialInput;
}

/** What `certificate.committeeColdResign` takes */
export interface CommitteeColdResignParams extends CredentialWitnessParams {
  /** The member's cold credential, or a reward address carrying it */
  cold: CredentialInput;
  /** Where the reasons are published */
  anchor?: AnchorInput;
}

/** What `certificate.drepRegistration` takes */
export interface DRepRegistrationParams extends CredentialWitnessParams {
  /** The DRep id, or its credential */
  drep: DRepCredentialInput;
  /** Lovelace deposited; the `drepDeposit` protocol parameter when omitted */
  deposit?: bigint;
  /** Where the DRep's metadata is published */
  anchor?: AnchorInput;
}

/** What `certificate.drepDeregistration` takes */
export interface DRepDeregistrationParams extends CredentialWitnessParams {
  /** The DRep id, or its credential */
  drep: DRepCredentialInput;
  /**
   * Lovelace refunded, which must be the deposit paid; the `drepDeposit` protocol parameter
   * when omitted
   */
  refund?: bigint;
}

/** What `certificate.drepUpdate` takes */
export interface DRepUpdateParams extends CredentialWitnessParams {
  /** The DRep id, or its credential */
  drep: DRepCredentialInput;
  /** Where the DRep's metadata is published; left out to clear it */
  anchor?: AnchorInput;
}

const toIpv4 = (ctx: PartContext, ip: string): Ipv4Prototype => {
  const octets = ip.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)
  )
    fail(ctx, "INVALID_DATA", `invalid IPv4 address ${ip}`);
  return octets as Ipv4Prototype;
};

const toIpv6 = (ctx: PartContext, ip: string): Ipv6Prototype => {
  const [head = "", tail, extra] = ip.split("::");
  const groups = (part: string) => (part === "" ? [] : part.split(":"));
  const left = groups(head);
  const right = tail === undefined ? [] : groups(tail);
  const missing = 8 - left.length - right.length;
  const all =
    tail === undefined
      ? left
      : [...left, ...Array(missing).fill("0"), ...right];
  if (
    extra !== undefined ||
    missing < 0 ||
    all.length !== 8 ||
    all.some((g) => !/^[0-9a-fA-F]{1,4}$/.test(g))
  )
    fail(ctx, "INVALID_DATA", `invalid IPv6 address ${ip}`);
  return all.flatMap((g) => {
    const n = parseInt(g, 16);
    return [n >> 8, n & 0xff];
  }) as Ipv6Prototype;
};

/** DNS names in relays are at most 64 bytes */
const MAX_DNS_BYTES = 64;

const toDnsName = (ctx: PartContext, name: string) => {
  if (
    typeof name !== "string" ||
    name.length === 0 ||
    new TextEncoder().encode(name).length > MAX_DNS_BYTES
  )
    fail(ctx, "INVALID_DATA", `invalid DNS name ${name}`);
  return name;
};

const toPort = (ctx: PartContext, port: number | undefined) => {
  if (
    port !== undefined &&
    (!Number.isInteger(port) || port < 0 || port > 0xffff)
  )
    fail(ctx, "INVALID_DATA", `invalid port ${shownValue(port)}`);
  return port;
};

const toRelay = (ctx: PartContext, relay: Relay): RelayPrototype => {
  if (typeof relay !== "object" || relay === null)
    return fail(ctx, "INVALID_DATA", `invalid relay ${shownValue(relay)}`);
  switch (relay.type) {
    case "SingleHostAddr": {
      const port = toPort(ctx, relay.port);
      return {
        type: "SINGLE_HOST_ADDR",
        value: {
          ...(relay.IPV4 && { ipv4: toIpv4(ctx, relay.IPV4) }),
          ...(relay.IPV6 && { ipv6: toIpv6(ctx, relay.IPV6) }),
          ...(port !== undefined && { port }),
        },
      };
    }
    case "SingleHostName": {
      const port = toPort(ctx, relay.port);
      return {
        type: "SINGLE_HOST_NAME",
        value: {
          dns_name: toDnsName(ctx, relay.domainName),
          ...(port !== undefined && { port }),
        },
      };
    }
    case "MultiHostName":
      return {
        type: "MULTI_HOST_NAME",
        value: { dns_name: toDnsName(ctx, relay.domainName) },
      };
    default:
      return fail(
        ctx,
        "INVALID_DATA",
        `invalid relay ${JSON.stringify(relay)}`,
      );
  }
};

/** Pool metadata URLs are at most 64 bytes */
const MAX_POOL_METADATA_URL_BYTES = 64;

const toPoolParams = (
  ctx: PartContext,
  params: PoolParams,
): PoolParamsPrototype => {
  if (typeof params !== "object" || params === null)
    fail(ctx, "INVALID_DATA", `invalid pool parameters ${shownValue(params)}`);
  if (!Array.isArray(params.margin))
    fail(ctx, "INVALID_VALUE", `invalid margin ${shownValue(params.margin)}`);
  if (!Array.isArray(params.owners))
    fail(
      ctx,
      "INVALID_DATA",
      `invalid pool owners ${shownValue(params.owners)}`,
    );
  const vrf =
    typeof params.vrfKeyHash === "string"
      ? params.vrfKeyHash.toLowerCase()
      : "";
  if (!isHash32(vrf))
    fail(
      ctx,
      "INVALID_DATA",
      `invalid VRF key hash: expected a 32-byte hash in hex; got ${shownValue(params.vrfKeyHash)}`,
    );
  const coin = (name: string, value: string) => {
    if (typeof value !== "string" || !/^\d+$/.test(value))
      fail(ctx, "INVALID_VALUE", `invalid ${name} ${shownValue(value)}`);
    return value;
  };
  const [numerator, denominator] = params.margin;
  if (
    !Number.isSafeInteger(numerator) ||
    !Number.isSafeInteger(denominator) ||
    denominator <= 0 ||
    numerator < 0 ||
    numerator > denominator
  )
    fail(
      ctx,
      "INVALID_VALUE",
      `invalid margin ${params.margin.map(shownValue).join("/")}`,
    );
  const owners = params.owners.map((owner) => {
    const hash = typeof owner === "string" ? owner.toLowerCase() : "";
    if (!isHash28(hash))
      fail(
        ctx,
        "INVALID_DATA",
        `invalid pool owner: expected a 28-byte key hash in hex; got ${shownValue(owner)}`,
      );
    return hash;
  });
  const rewardAccount = toRewardAddress(ctx, params.rewardAddress).address;
  let poolMetadata: PoolParamsPrototype["pool_metadata"];
  if (params.metadata) {
    const hash =
      typeof params.metadata.hash === "string"
        ? params.metadata.hash.toLowerCase()
        : "";
    if (!isHash32(hash))
      fail(
        ctx,
        "INVALID_DATA",
        `invalid pool metadata hash: expected a 32-byte hash in hex; got ${shownValue(params.metadata.hash)}`,
      );
    if (
      typeof params.metadata.URL !== "string" ||
      new TextEncoder().encode(params.metadata.URL).length >
        MAX_POOL_METADATA_URL_BYTES
    )
      fail(
        ctx,
        "INVALID_DATA",
        `invalid pool metadata url: expected a text of at most ${MAX_POOL_METADATA_URL_BYTES} bytes; got ${shownValue(params.metadata.URL)}`,
      );
    poolMetadata = { url: params.metadata.URL, pool_metadata_hash: hash };
  }
  return {
    operator: toPoolKeyHash(ctx, params.operator),
    vrf_keyhash: vrf,
    pledge: coin("pledge", params.pledge),
    cost: coin("cost", params.cost),
    margin: { numerator: String(numerator), denominator: String(denominator) },
    reward_account: rewardAccount,
    pool_owners: owners,
    relays: (Array.isArray(params.relays)
      ? params.relays
      : fail(ctx, "INVALID_DATA", `invalid relays ${shownValue(params.relays)}`)
    ).map((relay) => toRelay(ctx, relay)),
    ...(poolMetadata && { pool_metadata: poolMetadata }),
  };
};

/** The builders of certificate parts, one for each kind of certificate */
export interface CertificateBuilders {
  /**
   * Register a stake credential, stating its deposit (certificate 7). Like every other
   * certificate of the credential, it needs the credential's witness.
   */
  stakeRegistration(params: StakeRegistrationParams): CertificatePart;

  /** Deregister a stake credential, stating the refund (certificate 8). */
  stakeDeregistration(params: StakeDeregistrationParams): CertificatePart;

  /**
   * Register a stake credential without stating its deposit (certificate 0). It takes no
   * witness; the deposit is the `keyDeposit` protocol parameter.
   * @deprecated The next ledger era does not decode certificate 0. Use
   *   `certificate.stakeRegistration`, which states the deposit; unlike this form it needs the
   *   credential's witness: its key's signature, or the script given as `witness`.
   */
  legacyStakeRegistration(
    params: LegacyStakeRegistrationParams,
  ): CertificatePart;

  /**
   * Deregister a stake credential without stating the refund (certificate 1).
   * @deprecated The next ledger era does not decode certificate 1. Use
   *   `certificate.stakeDeregistration`, which states the refund; a Plutus script credential is
   *   then witnessed by a V3 script only.
   */
  legacyStakeDeregistration(
    params: LegacyStakeDeregistrationParams,
  ): CertificatePart;

  /** Delegate a stake credential to a pool. */
  stakeDelegation(params: StakeDelegationParams): CertificatePart;

  /** Delegate a stake credential's vote. */
  voteDelegation(params: VoteDelegationParams): CertificatePart;

  /** Delegate a stake credential to a pool and its vote to a DRep. */
  stakeAndVoteDelegation(params: StakeAndVoteDelegationParams): CertificatePart;

  /** Register a stake credential and delegate it to a pool. */
  stakeRegistrationAndDelegation(
    params: StakeRegistrationAndDelegationParams,
  ): CertificatePart;

  /** Register a stake credential and delegate its vote. */
  voteRegistrationAndDelegation(
    params: VoteRegistrationAndDelegationParams,
  ): CertificatePart;

  /** Register a stake credential, delegate it to a pool and delegate its vote. */
  stakeVoteRegistrationAndDelegation(
    params: StakeVoteRegistrationAndDelegationParams,
  ): CertificatePart;

  /**
   * Register or update a stake pool. Signed by the operator and owner keys; the deposit is the
   * `poolDeposit` protocol parameter, owed only on first registration.
   */
  poolRegistration(params: PoolRegistrationParams): CertificatePart;

  /** Retire a stake pool at the start of an epoch. Signed by the operator key. */
  poolRetirement(params: PoolRetirementParams): CertificatePart;

  /** Authorise a hot credential to vote for a constitutional committee member. */
  committeeHotAuth(params: CommitteeHotAuthParams): CertificatePart;

  /** Resign from the constitutional committee. */
  committeeColdResign(params: CommitteeColdResignParams): CertificatePart;

  /** Register a DRep. */
  drepRegistration(params: DRepRegistrationParams): CertificatePart;

  /** Deregister a DRep. */
  drepDeregistration(params: DRepDeregistrationParams): CertificatePart;

  /** Update a DRep's metadata anchor. */
  drepUpdate(params: DRepUpdateParams): CertificatePart;
}

export const certificate: CertificateBuilders = {
  stakeRegistration: (params: StakeRegistrationParams): CertificatePart => {
    const ctx = ctxOf(params);
    const credential = toCredential(ctx, params.stake);
    const { coin, depositParameter } = toDeposit(
      ctx,
      params.deposit,
      "keyDeposit",
    );
    return build(
      ctx,
      {
        type: "STAKE_REGISTRATION",
        value: {
          stake_credential: toPrototypeCredential(credential),
          ...(coin && { coin }),
        },
      },
      toCredentialWitness(ctx, credential, params.witness, {
        plutusV3Only: true,
      }),
      depositParameter,
    );
  },

  stakeDeregistration: (params: StakeDeregistrationParams): CertificatePart => {
    const ctx = ctxOf(params);
    const credential = toCredential(ctx, params.stake);
    const { coin, depositParameter } = toDeposit(
      ctx,
      params.refund,
      "keyDeposit",
    );
    return build(
      ctx,
      {
        type: "STAKE_DEREGISTRATION",
        value: {
          stake_credential: toPrototypeCredential(credential),
          ...(coin && { coin }),
        },
      },
      toCredentialWitness(ctx, credential, params.witness, {
        plutusV3Only: true,
      }),
      depositParameter,
    );
  },

  legacyStakeRegistration: (
    params: LegacyStakeRegistrationParams,
  ): CertificatePart => {
    const ctx = ctxOf(params);
    return build(
      ctx,
      {
        type: "STAKE_REGISTRATION",
        value: {
          stake_credential: toPrototypeCredential(
            toCredential(ctx, params.stake),
          ),
        },
      },
      { type: "none" },
    );
  },

  legacyStakeDeregistration: (
    params: LegacyStakeDeregistrationParams,
  ): CertificatePart => {
    const ctx = ctxOf(params);
    const credential = toCredential(ctx, params.stake);
    return build(
      ctx,
      {
        type: "STAKE_DEREGISTRATION",
        value: { stake_credential: toPrototypeCredential(credential) },
      },
      toCredentialWitness(ctx, credential, params.witness, {
        plutusV3Only: false,
      }),
    );
  },

  stakeDelegation: (params: StakeDelegationParams): CertificatePart => {
    const ctx = ctxOf(params);
    const credential = toCredential(ctx, params.stake);
    return build(
      ctx,
      {
        type: "STAKE_DELEGATION",
        value: {
          stake_credential: toPrototypeCredential(credential),
          pool_keyhash: toPoolKeyHash(ctx, params.pool),
        },
      },
      toCredentialWitness(ctx, credential, params.witness, {
        plutusV3Only: false,
      }),
    );
  },

  voteDelegation: (params: VoteDelegationParams): CertificatePart => {
    const ctx = ctxOf(params);
    const credential = toCredential(ctx, params.stake);
    return build(
      ctx,
      {
        type: "VOTE_DELEGATION",
        value: {
          stake_credential: toPrototypeCredential(credential),
          drep: toDRep(ctx, params.drep),
        },
      },
      toCredentialWitness(ctx, credential, params.witness, {
        plutusV3Only: true,
      }),
    );
  },

  stakeAndVoteDelegation: (
    params: StakeAndVoteDelegationParams,
  ): CertificatePart => {
    const ctx = ctxOf(params);
    const credential = toCredential(ctx, params.stake);
    return build(
      ctx,
      {
        type: "STAKE_AND_VOTE_DELEGATION",
        value: {
          stake_credential: toPrototypeCredential(credential),
          pool_keyhash: toPoolKeyHash(ctx, params.pool),
          drep: toDRep(ctx, params.drep),
        },
      },
      toCredentialWitness(ctx, credential, params.witness, {
        plutusV3Only: true,
      }),
    );
  },

  stakeRegistrationAndDelegation: (
    params: StakeRegistrationAndDelegationParams,
  ): CertificatePart => {
    const ctx = ctxOf(params);
    const credential = toCredential(ctx, params.stake);
    const { coin, depositParameter } = toDeposit(
      ctx,
      params.deposit,
      "keyDeposit",
    );
    return build(
      ctx,
      {
        type: "STAKE_REGISTRATION_AND_DELEGATION",
        value: {
          stake_credential: toPrototypeCredential(credential),
          pool_keyhash: toPoolKeyHash(ctx, params.pool),
          ...(coin && { coin }),
        },
      },
      toCredentialWitness(ctx, credential, params.witness, {
        plutusV3Only: true,
      }),
      depositParameter,
    );
  },

  voteRegistrationAndDelegation: (
    params: VoteRegistrationAndDelegationParams,
  ): CertificatePart => {
    const ctx = ctxOf(params);
    const credential = toCredential(ctx, params.stake);
    const { coin, depositParameter } = toDeposit(
      ctx,
      params.deposit,
      "keyDeposit",
    );
    return build(
      ctx,
      {
        type: "VOTE_REGISTRATION_AND_DELEGATION",
        value: {
          stake_credential: toPrototypeCredential(credential),
          drep: toDRep(ctx, params.drep),
          ...(coin && { coin }),
        },
      },
      toCredentialWitness(ctx, credential, params.witness, {
        plutusV3Only: true,
      }),
      depositParameter,
    );
  },

  stakeVoteRegistrationAndDelegation: (
    params: StakeVoteRegistrationAndDelegationParams,
  ): CertificatePart => {
    const ctx = ctxOf(params);
    const credential = toCredential(ctx, params.stake);
    const { coin, depositParameter } = toDeposit(
      ctx,
      params.deposit,
      "keyDeposit",
    );
    return build(
      ctx,
      {
        type: "STAKE_VOTE_REGISTRATION_AND_DELEGATION",
        value: {
          stake_credential: toPrototypeCredential(credential),
          pool_keyhash: toPoolKeyHash(ctx, params.pool),
          drep: toDRep(ctx, params.drep),
          ...(coin && { coin }),
        },
      },
      toCredentialWitness(ctx, credential, params.witness, {
        plutusV3Only: true,
      }),
      depositParameter,
    );
  },

  poolRegistration: (params: PoolRegistrationParams): CertificatePart => {
    const ctx = ctxOf(params);
    return build(
      ctx,
      {
        type: "POOL_REGISTRATION",
        value: { pool_params: toPoolParams(ctx, params.params) },
      },
      { type: "key" },
    );
  },

  poolRetirement: (params: PoolRetirementParams): CertificatePart => {
    const ctx = ctxOf(params);
    const { epoch } = params;
    if (
      (typeof epoch !== "bigint" && !Number.isSafeInteger(epoch)) ||
      epoch < 0 ||
      BigInt(epoch) >= 2n ** 64n
    )
      fail(ctx, "INVALID_DATA", `invalid epoch ${shownValue(epoch)}`);
    return build(
      ctx,
      {
        type: "POOL_RETIREMENT",
        value: {
          pool_keyhash: toPoolKeyHash(ctx, params.pool),
          epoch: BigInt(epoch),
        },
      },
      { type: "key" },
    );
  },

  committeeHotAuth: (params: CommitteeHotAuthParams): CertificatePart => {
    const ctx = ctxOf(params);
    const cold = toCredential(ctx, params.cold);
    return build(
      ctx,
      {
        type: "COMMITTEE_HOT_AUTH",
        value: {
          committee_cold_credential: toPrototypeCredential(cold),
          committee_hot_credential: toPrototypeCredential(
            toCredential(ctx, params.hot),
          ),
        },
      },
      toCredentialWitness(ctx, cold, params.witness, { plutusV3Only: true }),
    );
  },

  committeeColdResign: (params: CommitteeColdResignParams): CertificatePart => {
    const ctx = ctxOf(params);
    const cold = toCredential(ctx, params.cold);
    const anchor = toAnchor(ctx, params.anchor);
    return build(
      ctx,
      {
        type: "COMMITTEE_COLD_RESIGN",
        value: {
          committee_cold_credential: toPrototypeCredential(cold),
          ...(anchor && { anchor }),
        },
      },
      toCredentialWitness(ctx, cold, params.witness, { plutusV3Only: true }),
    );
  },

  drepRegistration: (params: DRepRegistrationParams): CertificatePart => {
    const ctx = ctxOf(params);
    const credential = toDRepCredential(ctx, params.drep);
    const { coin, depositParameter } = toDeposit(
      ctx,
      params.deposit,
      "drepDeposit",
    );
    const anchor = toAnchor(ctx, params.anchor);
    return build(
      ctx,
      {
        type: "DREP_REGISTRATION",
        value: {
          voting_credential: toPrototypeCredential(credential),
          ...(coin && { coin }),
          ...(anchor && { anchor }),
        },
      },
      toCredentialWitness(ctx, credential, params.witness, {
        plutusV3Only: true,
      }),
      depositParameter,
    );
  },

  drepDeregistration: (params: DRepDeregistrationParams): CertificatePart => {
    const ctx = ctxOf(params);
    const credential = toDRepCredential(ctx, params.drep);
    const { coin, depositParameter } = toDeposit(
      ctx,
      params.refund,
      "drepDeposit",
    );
    return build(
      ctx,
      {
        type: "DREP_DEREGISTRATION",
        value: {
          voting_credential: toPrototypeCredential(credential),
          ...(coin && { coin }),
        },
      },
      toCredentialWitness(ctx, credential, params.witness, {
        plutusV3Only: true,
      }),
      depositParameter,
    );
  },

  drepUpdate: (params: DRepUpdateParams): CertificatePart => {
    const ctx = ctxOf(params);
    const credential = toDRepCredential(ctx, params.drep);
    const anchor = toAnchor(ctx, params.anchor);
    return build(
      ctx,
      {
        type: "DREP_UPDATE",
        value: {
          voting_credential: toPrototypeCredential(credential),
          ...(anchor && { anchor }),
        },
      },
      toCredentialWitness(ctx, credential, params.witness, {
        plutusV3Only: true,
      }),
    );
  },
};
