import {
  mConStr0,
  NativeScript,
  PoolParams,
  resolveNativeScriptHash,
  resolveScriptHash,
  TransactionPrototype,
} from "@meshsdk/core";
import {
  Cardano,
  scriptHashToRewardAddress,
  transactionPrototypeFromHex,
  transactionPrototypeToHex,
} from "@meshsdk/core-cst";

import {
  certificate,
  CertificatePart,
  TxPartError,
  unresolved,
} from "../../../src/tx-builder";
import {
  alwaysSucceedCbor,
  alwaysSucceedHash,
  drepBech32,
  keyHashHex,
  rewardAddress,
} from "../../test-util";

const keyStake = rewardAddress(1);
const keyStakeHash = Cardano.Address.fromBech32(keyStake)
  .asReward()!
  .getPaymentCredential()
  .hash.toString();
const plutusStake = scriptHashToRewardAddress(alwaysSucceedHash, 0);
const plutusV2Script = { code: alwaysSucceedCbor, version: "V2" as const };
// A script's hash covers its language, so the V2 script locks a different credential
const plutusV2Stake = scriptHashToRewardAddress(
  resolveScriptHash(alwaysSucceedCbor, "V2"),
  0,
);
const nativeScript: NativeScript = { type: "all", scripts: [] };
const nativeStake = scriptHashToRewardAddress(
  resolveNativeScriptHash(nativeScript),
  0,
);
const plutusWitness = {
  plutus: { code: alwaysSucceedCbor, version: "V3" as const },
  redeemer: { data: mConStr0([]) },
};
const poolHash = keyHashHex(7);
const poolId = Cardano.PoolId.fromKeyHash(poolHash as never).toString();
const drep = drepBech32(3);
const anchor = { url: "https://example.com/a.json", dataHash: "ab".repeat(32) };

const expectPartError = (build: () => unknown, code: string) => {
  try {
    build();
  } catch (error) {
    expect(error).toBeInstanceOf(TxPartError);
    expect((error as TxPartError).code).toBe(code);
    return;
  }
  throw new Error(`expected a ${code} error`);
};

describe("stake registration", () => {
  it("states the deposit (certificate 7), or leaves it to keyDeposit", () => {
    const stated = certificate.stakeRegistration({
      stake: keyStake,
      deposit: 2_000_000n,
    });
    expect(stated.certificate).toEqual({
      type: "STAKE_REGISTRATION",
      value: {
        stake_credential: { type: "KEY", value: keyStakeHash },
        coin: "2000000",
      },
    });
    expect(stated.witness).toEqual({ type: "key" });
    expect(unresolved(stated)).toEqual([]);

    const pending = certificate.stakeRegistration({ stake: keyStake });
    expect(pending.depositParameter).toBe("keyDeposit");
    expect(unresolved(pending)).toEqual([
      { type: "deposit", parameter: "keyDeposit" },
    ]);
  });

  it("needs a witness for a script credential, and V3 for a Plutus one", () => {
    expectPartError(
      () => certificate.stakeRegistration({ stake: plutusStake, deposit: 1n }),
      "WITNESS_MISMATCH",
    );
    const part = certificate.stakeRegistration({
      stake: plutusStake,
      deposit: 1n,
      witness: plutusWitness,
    });
    expect(part.witness).toMatchObject({
      type: "plutus",
      script: { scriptHash: alwaysSucceedHash },
    });
    expect(unresolved(part)).toEqual([{ type: "exUnits" }]);
    expectPartError(
      () =>
        certificate.stakeRegistration({
          stake: plutusV2Stake,
          witness: { ...plutusWitness, plutus: plutusV2Script },
        }),
      "WITNESS_MISMATCH",
    );
  });

  it("rejects a witness for a key credential and a script that does not match", () => {
    expectPartError(
      () =>
        certificate.stakeRegistration({
          stake: keyStake,
          witness: { native: nativeScript },
        }),
      "WITNESS_MISMATCH",
    );
    expectPartError(
      () =>
        certificate.stakeDelegation({
          stake: plutusStake,
          pool: poolId,
          witness: { native: nativeScript },
        }),
      "WITNESS_MISMATCH",
    );
  });

  it("registers without a deposit or witness the legacy way (certificate 0)", () => {
    const part = certificate.legacyStakeRegistration({ stake: plutusStake });
    expect(part.certificate).toEqual({
      type: "STAKE_REGISTRATION",
      value: { stake_credential: { type: "SCRIPT", value: alwaysSucceedHash } },
    });
    expect(part.witness).toEqual({ type: "none" });
    expect(unresolved(part)).toEqual([]);
  });

  it("deregisters the legacy way, with any Plutus version", () => {
    const part = certificate.legacyStakeDeregistration({
      stake: plutusV2Stake,
      witness: { ...plutusWitness, plutus: plutusV2Script },
    });
    expect(part.certificate.type).toBe("STAKE_DEREGISTRATION");
    expect(part.witness).toMatchObject({ script: { version: "V2" } });
  });

  it("takes a credential directly", () => {
    const part = certificate.stakeDeregistration({
      stake: { type: "KEY", value: keyStakeHash.toUpperCase() },
      refund: 2_000_000n,
    });
    expect(part.certificate.value).toEqual({
      stake_credential: { type: "KEY", value: keyStakeHash },
      coin: "2000000",
    });
  });
});

describe("delegation", () => {
  it("takes a pool by bech32 id or key hash", () => {
    const byId = certificate.stakeDelegation({ stake: keyStake, pool: poolId });
    const byHash = certificate.stakeDelegation({
      stake: keyStake,
      pool: poolHash,
    });
    expect(byId).toEqual(byHash);
    expect(byId.certificate.value).toMatchObject({ pool_keyhash: poolHash });
    expectPartError(
      () => certificate.stakeDelegation({ stake: keyStake, pool: "pool1x" }),
      "INVALID_DATA",
    );
  });

  it("delegates the vote to a DRep in any form", () => {
    const drepHash = Cardano.DRepID.toCredential(
      Cardano.DRepID(drep),
    ).hash.toString();
    const of = (
      drepInput: Parameters<typeof certificate.voteDelegation>[0]["drep"],
    ) =>
      certificate.voteDelegation({ stake: keyStake, drep: drepInput })
        .certificate.value;

    expect(of(drep)).toMatchObject({
      drep: { type: "KEY_HASH", value: drepHash },
    });
    expect(of({ type: "KEY", value: drepHash })).toEqual(of(drep));
    expect(of({ type: "KEY_HASH", value: drepHash })).toEqual(of(drep));
    expect(of("alwaysAbstain")).toMatchObject({
      drep: { type: "ALWAYS_ABSTAIN" },
    });
    expect(of("alwaysNoConfidence")).toMatchObject({
      drep: { type: "ALWAYS_NO_CONFIDENCE" },
    });
    expectPartError(() => of("drep1nope"), "INVALID_DATA");
  });

  it("combines registration and delegations, leaving the deposit to keyDeposit", () => {
    const parts = [
      certificate.stakeAndVoteDelegation({
        stake: keyStake,
        pool: poolId,
        drep,
      }),
      certificate.stakeRegistrationAndDelegation({
        stake: keyStake,
        pool: poolId,
      }),
      certificate.voteRegistrationAndDelegation({
        stake: keyStake,
        drep: "alwaysAbstain",
        deposit: 2n,
      }),
      certificate.stakeVoteRegistrationAndDelegation({
        stake: nativeStake,
        pool: poolId,
        drep,
        witness: { native: nativeScript },
      }),
    ];

    expect(parts.map((part) => part.certificate.type)).toEqual([
      "STAKE_AND_VOTE_DELEGATION",
      "STAKE_REGISTRATION_AND_DELEGATION",
      "VOTE_REGISTRATION_AND_DELEGATION",
      "STAKE_VOTE_REGISTRATION_AND_DELEGATION",
    ]);
    expect(parts.map(unresolved)).toEqual([
      [],
      [{ type: "deposit", parameter: "keyDeposit" }],
      [],
      [{ type: "deposit", parameter: "keyDeposit" }],
    ]);
  });
});

describe("pools", () => {
  const params: PoolParams = {
    operator: poolId,
    vrfKeyHash: "cd".repeat(32),
    pledge: "1000000000",
    cost: "340000000",
    margin: [1, 100],
    owners: [keyStakeHash],
    rewardAddress: keyStake,
    relays: [
      { type: "SingleHostAddr", IPV4: "10.0.0.1", port: 3001 },
      { type: "SingleHostAddr", IPV6: "2001:db8::1" },
      { type: "SingleHostName", domainName: "relay.example.com", port: 3001 },
      { type: "MultiHostName", domainName: "_relays._tcp.example.com" },
    ],
    metadata: { URL: "https://example.com/p.json", hash: "ef".repeat(32) },
  };

  it("registers a pool, signed by its keys", () => {
    const part = certificate.poolRegistration({ params });

    expect(part.witness).toEqual({ type: "key" });
    expect(part.certificate.value).toEqual({
      pool_params: {
        operator: poolHash,
        vrf_keyhash: "cd".repeat(32),
        pledge: "1000000000",
        cost: "340000000",
        margin: { numerator: "1", denominator: "100" },
        reward_account: keyStake,
        pool_owners: [keyStakeHash],
        relays: [
          {
            type: "SINGLE_HOST_ADDR",
            value: { ipv4: [10, 0, 0, 1], port: 3001 },
          },
          {
            type: "SINGLE_HOST_ADDR",
            value: {
              ipv6: [
                0x20, 0x01, 0x0d, 0xb8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
              ],
            },
          },
          {
            type: "SINGLE_HOST_NAME",
            value: { dns_name: "relay.example.com", port: 3001 },
          },
          {
            type: "MULTI_HOST_NAME",
            value: { dns_name: "_relays._tcp.example.com" },
          },
        ],
        pool_metadata: {
          url: "https://example.com/p.json",
          pool_metadata_hash: "ef".repeat(32),
        },
      },
    });
  });

  it("rejects malformed pool parameters", () => {
    for (const bad of [
      { margin: [2, 1] as [number, number] },
      { pledge: "-1" },
      { vrfKeyHash: "cd" },
      { owners: ["aa"] },
      { relays: [{ type: "SingleHostAddr" as const, IPV4: "300.0.0.1" }] },
      { relays: [{ type: "SingleHostAddr" as const, IPV6: "1::2::3" }] },
    ]) {
      expect(() =>
        certificate.poolRegistration({ params: { ...params, ...bad } }),
      ).toThrow(TxPartError);
    }
  });

  it("retires a pool", () => {
    const part = certificate.poolRetirement({ pool: poolId, epoch: 600 });
    expect(part.certificate.value).toEqual({
      pool_keyhash: poolHash,
      epoch: 600n,
    });
    expectPartError(
      () => certificate.poolRetirement({ pool: poolId, epoch: -1 }),
      "INVALID_DATA",
    );
  });
});

describe("governance certificates", () => {
  it("authorises a committee hot credential and resigns", () => {
    const auth = certificate.committeeHotAuth({
      cold: keyStake,
      hot: { type: "SCRIPT", value: alwaysSucceedHash },
    });
    expect(auth.certificate.value).toEqual({
      committee_cold_credential: { type: "KEY", value: keyStakeHash },
      committee_hot_credential: { type: "SCRIPT", value: alwaysSucceedHash },
    });

    const resign = certificate.committeeColdResign({ cold: keyStake, anchor });
    expect(resign.certificate.value).toMatchObject({
      anchor: { anchor_url: anchor.url, anchor_data_hash: anchor.dataHash },
    });
  });

  it("registers, updates and deregisters a DRep", () => {
    const registration = certificate.drepRegistration({ drep, anchor });
    expect(registration.depositParameter).toBe("drepDeposit");
    expect(unresolved(registration)).toEqual([
      { type: "deposit", parameter: "drepDeposit" },
    ]);

    const scriptDrep = certificate.drepUpdate({
      drep: { type: "SCRIPT", value: alwaysSucceedHash },
      witness: plutusWitness,
    });
    expect(scriptDrep.witness.type).toBe("plutus");

    const deregistration = certificate.drepDeregistration({
      drep,
      refund: 500_000_000n,
    });
    expect(deregistration.certificate.value).toMatchObject({
      coin: "500000000",
    });
  });

  it("rejects malformed anchors", () => {
    expectPartError(
      () =>
        certificate.drepUpdate({ drep, anchor: { ...anchor, dataHash: "ab" } }),
      "INVALID_DATA",
    );
    expectPartError(
      () =>
        certificate.drepUpdate({
          drep,
          anchor: { ...anchor, url: "x".repeat(129) },
        }),
      "INVALID_DATA",
    );
  });
});

describe("certificates as TransactionPrototype fragments", () => {
  it("survive encoding to CBOR and decoding back", () => {
    const parts: CertificatePart[] = [
      certificate.stakeRegistration({ stake: keyStake, deposit: 2_000_000n }),
      certificate.legacyStakeRegistration({ stake: keyStake }),
      certificate.stakeDeregistration({ stake: keyStake, refund: 2_000_000n }),
      certificate.legacyStakeDeregistration({ stake: keyStake }),
      certificate.stakeDelegation({ stake: keyStake, pool: poolId }),
      certificate.voteDelegation({ stake: keyStake, drep }),
      certificate.stakeAndVoteDelegation({
        stake: keyStake,
        pool: poolId,
        drep: "alwaysAbstain",
      }),
      certificate.stakeRegistrationAndDelegation({
        stake: keyStake,
        pool: poolId,
        deposit: 2_000_000n,
      }),
      certificate.voteRegistrationAndDelegation({
        stake: keyStake,
        drep: "alwaysNoConfidence",
        deposit: 2_000_000n,
      }),
      certificate.stakeVoteRegistrationAndDelegation({
        stake: keyStake,
        pool: poolId,
        drep,
        deposit: 2_000_000n,
      }),
      certificate.poolRetirement({ pool: poolId, epoch: 600 }),
      certificate.committeeHotAuth({ cold: keyStake, hot: keyStake }),
      certificate.committeeColdResign({ cold: keyStake, anchor }),
      certificate.drepRegistration({ drep, deposit: 500_000_000n, anchor }),
      certificate.drepDeregistration({ drep, refund: 500_000_000n }),
      certificate.drepUpdate({ drep }),
    ];
    const proto: TransactionPrototype = {
      body: {
        inputs: [{ transaction_id: "a".repeat(64), index: 0 }],
        outputs: [],
        fee: "200000",
        certs: parts.map(
          (part) =>
            part.certificate as NonNullable<
              TransactionPrototype["body"]["certs"]
            >[number],
        ),
      },
      witness_set: {},
      is_valid: true,
    };

    const decoded = transactionPrototypeFromHex(
      transactionPrototypeToHex(proto),
    );

    // The decoder reports absent optional fields (a legacy certificate's coin, a missing
    // anchor) as null
    const withoutNulls = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(withoutNulls)
        : value !== null && typeof value === "object"
          ? Object.fromEntries(
              Object.entries(value)
                .filter(([, v]) => v !== null)
                .map(([k, v]) => [k, withoutNulls(v)]),
            )
          : value;
    expect(withoutNulls(decoded.body.certs)).toEqual(proto.body.certs);
  });
});
