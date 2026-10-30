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
  PartContext,
  rewardCredential,
} from "./normalize";
import {
  AnchorInput,
  CertificateFragment,
  CertificatePart,
  CredentialInput,
  CredentialWitnessInput,
  DRepCredentialInput,
  DRepInput,
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

const ctxOf = (label?: string): PartContext => ({ part: "certificate", label });

type Labelled = { label?: string };
type Witnessed = Labelled & {
  /** Needed when the credential is a script */
  witness?: CredentialWitnessInput;
};

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
    fail(ctx, "INVALID_DATA", `invalid port ${port}`);
  return port;
};

const toRelay = (ctx: PartContext, relay: Relay): RelayPrototype => {
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
  const vrf =
    typeof params.vrfKeyHash === "string"
      ? params.vrfKeyHash.toLowerCase()
      : "";
  if (!isHash32(vrf))
    fail(ctx, "INVALID_DATA", `invalid VRF key hash ${params.vrfKeyHash}`);
  const coin = (name: string, value: string) => {
    if (typeof value !== "string" || !/^\d+$/.test(value))
      fail(ctx, "INVALID_VALUE", `invalid ${name} ${value}`);
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
    fail(ctx, "INVALID_VALUE", `invalid margin ${params.margin.join("/")}`);
  const owners = params.owners.map((owner) => {
    const hash = typeof owner === "string" ? owner.toLowerCase() : "";
    if (!isHash28(hash))
      fail(ctx, "INVALID_DATA", `invalid pool owner ${owner}`);
    return hash;
  });
  rewardCredential(ctx, params.rewardAddress);
  let poolMetadata: PoolParamsPrototype["pool_metadata"];
  if (params.metadata) {
    const hash = params.metadata.hash.toLowerCase();
    if (!isHash32(hash))
      fail(
        ctx,
        "INVALID_DATA",
        `invalid pool metadata hash ${params.metadata.hash}`,
      );
    if (
      new TextEncoder().encode(params.metadata.URL).length >
      MAX_POOL_METADATA_URL_BYTES
    )
      fail(
        ctx,
        "INVALID_DATA",
        `invalid pool metadata url ${params.metadata.URL}`,
      );
    poolMetadata = { url: params.metadata.URL, pool_metadata_hash: hash };
  }
  return {
    operator: toPoolKeyHash(ctx, params.operator),
    vrf_keyhash: vrf,
    pledge: coin("pledge", params.pledge),
    cost: coin("cost", params.cost),
    margin: { numerator: String(numerator), denominator: String(denominator) },
    reward_account: params.rewardAddress,
    pool_owners: owners,
    relays: params.relays.map((relay) => toRelay(ctx, relay)),
    ...(poolMetadata && { pool_metadata: poolMetadata }),
  };
};

export const certificate = {
  /**
   * Register a stake credential, stating its deposit (certificate 7). Like every other
   * certificate of the credential, it needs the credential's witness.
   * @param params.stake A reward address, or the credential
   * @param params.deposit Lovelace deposited; the `keyDeposit` protocol parameter when omitted
   * @param params.witness The script authorising a script credential
   */
  stakeRegistration: (
    params: Witnessed & { stake: CredentialInput; deposit?: bigint },
  ): CertificatePart => {
    const ctx = ctxOf(params.label);
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

  /**
   * Deregister a stake credential, stating the refund (certificate 8).
   * @param params.stake A reward address, or the credential
   * @param params.refund Lovelace refunded, which must be the deposit paid; the `keyDeposit`
   *   protocol parameter when omitted
   * @param params.witness The script authorising a script credential
   */
  stakeDeregistration: (
    params: Witnessed & { stake: CredentialInput; refund?: bigint },
  ): CertificatePart => {
    const ctx = ctxOf(params.label);
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

  /**
   * Register a stake credential without stating its deposit (certificate 0). It takes no
   * witness; the deposit is the `keyDeposit` protocol parameter.
   * @param params.stake A reward address, or the credential
   */
  legacyStakeRegistration: (
    params: Labelled & { stake: CredentialInput },
  ): CertificatePart => {
    const ctx = ctxOf(params.label);
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

  /**
   * Deregister a stake credential without stating the refund (certificate 1).
   * @param params.stake A reward address, or the credential
   * @param params.witness The script authorising a script credential
   */
  legacyStakeDeregistration: (
    params: Witnessed & { stake: CredentialInput },
  ): CertificatePart => {
    const ctx = ctxOf(params.label);
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

  /**
   * Delegate a stake credential to a pool.
   * @param params.stake A reward address, or the credential
   * @param params.pool The pool id in bech32, or its key hash
   * @param params.witness The script authorising a script credential
   */
  stakeDelegation: (
    params: Witnessed & { stake: CredentialInput; pool: PoolInput },
  ): CertificatePart => {
    const ctx = ctxOf(params.label);
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

  /**
   * Delegate a stake credential's vote.
   * @param params.stake A reward address, or the credential
   * @param params.drep A DRep id, its credential, `"alwaysAbstain"` or `"alwaysNoConfidence"`
   * @param params.witness The script authorising a script credential
   */
  voteDelegation: (
    params: Witnessed & { stake: CredentialInput; drep: DRepInput },
  ): CertificatePart => {
    const ctx = ctxOf(params.label);
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

  /**
   * Delegate a stake credential to a pool and its vote to a DRep.
   * @param params.stake A reward address, or the credential
   * @param params.pool The pool id in bech32, or its key hash
   * @param params.drep A DRep id, its credential, `"alwaysAbstain"` or `"alwaysNoConfidence"`
   * @param params.witness The script authorising a script credential
   */
  stakeAndVoteDelegation: (
    params: Witnessed & {
      stake: CredentialInput;
      pool: PoolInput;
      drep: DRepInput;
    },
  ): CertificatePart => {
    const ctx = ctxOf(params.label);
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

  /**
   * Register a stake credential and delegate it to a pool.
   * @param params.stake A reward address, or the credential
   * @param params.pool The pool id in bech32, or its key hash
   * @param params.deposit Lovelace deposited; the `keyDeposit` protocol parameter when omitted
   * @param params.witness The script authorising a script credential
   */
  stakeRegistrationAndDelegation: (
    params: Witnessed & {
      stake: CredentialInput;
      pool: PoolInput;
      deposit?: bigint;
    },
  ): CertificatePart => {
    const ctx = ctxOf(params.label);
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

  /**
   * Register a stake credential and delegate its vote.
   * @param params.stake A reward address, or the credential
   * @param params.drep A DRep id, its credential, `"alwaysAbstain"` or `"alwaysNoConfidence"`
   * @param params.deposit Lovelace deposited; the `keyDeposit` protocol parameter when omitted
   * @param params.witness The script authorising a script credential
   */
  voteRegistrationAndDelegation: (
    params: Witnessed & {
      stake: CredentialInput;
      drep: DRepInput;
      deposit?: bigint;
    },
  ): CertificatePart => {
    const ctx = ctxOf(params.label);
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

  /**
   * Register a stake credential, delegate it to a pool and delegate its vote.
   * @param params.stake A reward address, or the credential
   * @param params.pool The pool id in bech32, or its key hash
   * @param params.drep A DRep id, its credential, `"alwaysAbstain"` or `"alwaysNoConfidence"`
   * @param params.deposit Lovelace deposited; the `keyDeposit` protocol parameter when omitted
   * @param params.witness The script authorising a script credential
   */
  stakeVoteRegistrationAndDelegation: (
    params: Witnessed & {
      stake: CredentialInput;
      pool: PoolInput;
      drep: DRepInput;
      deposit?: bigint;
    },
  ): CertificatePart => {
    const ctx = ctxOf(params.label);
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

  /**
   * Register or update a stake pool. Signed by the operator and owner keys; the deposit is the
   * `poolDeposit` protocol parameter, owed only on first registration.
   * @param params.params The pool's parameters
   */
  poolRegistration: (
    params: Labelled & { params: PoolParams },
  ): CertificatePart => {
    const ctx = ctxOf(params.label);
    return build(
      ctx,
      {
        type: "POOL_REGISTRATION",
        value: { pool_params: toPoolParams(ctx, params.params) },
      },
      { type: "key" },
    );
  },

  /**
   * Retire a stake pool at the start of an epoch. Signed by the operator key.
   * @param params.pool The pool id in bech32, or its key hash
   * @param params.epoch The epoch the pool retires at
   */
  poolRetirement: (
    params: Labelled & { pool: PoolInput; epoch: bigint | number },
  ): CertificatePart => {
    const ctx = ctxOf(params.label);
    const { epoch } = params;
    if (
      (typeof epoch !== "bigint" && !Number.isSafeInteger(epoch)) ||
      epoch < 0 ||
      BigInt(epoch) >= 2n ** 64n
    )
      fail(ctx, "INVALID_DATA", `invalid epoch ${epoch}`);
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

  /**
   * Authorise a hot credential to vote for a constitutional committee member.
   * @param params.cold The member's cold credential, or a reward address carrying it
   * @param params.hot The hot credential, or a reward address carrying it
   * @param params.witness The script authorising a script cold credential
   */
  committeeHotAuth: (
    params: Witnessed & { cold: CredentialInput; hot: CredentialInput },
  ): CertificatePart => {
    const ctx = ctxOf(params.label);
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

  /**
   * Resign from the constitutional committee.
   * @param params.cold The member's cold credential, or a reward address carrying it
   * @param params.anchor Where the reasons are published
   * @param params.witness The script authorising a script cold credential
   */
  committeeColdResign: (
    params: Witnessed & { cold: CredentialInput; anchor?: AnchorInput },
  ): CertificatePart => {
    const ctx = ctxOf(params.label);
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

  /**
   * Register a DRep.
   * @param params.drep The DRep id, or its credential
   * @param params.deposit Lovelace deposited; the `drepDeposit` protocol parameter when omitted
   * @param params.anchor Where the DRep's metadata is published
   * @param params.witness The script authorising a script credential
   */
  drepRegistration: (
    params: Witnessed & {
      drep: DRepCredentialInput;
      deposit?: bigint;
      anchor?: AnchorInput;
    },
  ): CertificatePart => {
    const ctx = ctxOf(params.label);
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

  /**
   * Deregister a DRep.
   * @param params.drep The DRep id, or its credential
   * @param params.refund Lovelace refunded, which must be the deposit paid; the `drepDeposit`
   *   protocol parameter when omitted
   * @param params.witness The script authorising a script credential
   */
  drepDeregistration: (
    params: Witnessed & { drep: DRepCredentialInput; refund?: bigint },
  ): CertificatePart => {
    const ctx = ctxOf(params.label);
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

  /**
   * Update a DRep's metadata anchor.
   * @param params.drep The DRep id, or its credential
   * @param params.anchor Where the DRep's metadata is published; left out to clear it
   * @param params.witness The script authorising a script credential
   */
  drepUpdate: (
    params: Witnessed & { drep: DRepCredentialInput; anchor?: AnchorInput },
  ): CertificatePart => {
    const ctx = ctxOf(params.label);
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
