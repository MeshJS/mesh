import { certificatePrototypeToCardano } from "../../src/tx-prototype-to-cbor/certificates";

const KEY_HASH = "aa".repeat(28);
const POOL_KEY_HASH = "bb".repeat(28);

describe("certificatePrototypeToCardano", () => {
  it("converts STAKE_REGISTRATION to a StakeRegistration cert carrying the raw credential", () => {
    const cert = certificatePrototypeToCardano(
      { type: "STAKE_REGISTRATION", value: { stake_credential: { type: "KEY", value: KEY_HASH } } },
      0,
    );
    const core = cert.toCore() as { stakeCredential: { hash: string } };
    expect(core.stakeCredential.hash.toString()).toEqual(KEY_HASH);
  });

  it("produces the same credential regardless of networkId (0 vs 1)", () => {
    const build = (networkId: 0 | 1) =>
      (
        certificatePrototypeToCardano(
          {
            type: "STAKE_DEREGISTRATION",
            value: { stake_credential: { type: "SCRIPT", value: KEY_HASH } },
          },
          networkId,
        ).toCore() as { stakeCredential: { hash: string } }
      ).stakeCredential.hash.toString();

    expect(build(0)).toEqual(build(1));
    expect(build(0)).toEqual(KEY_HASH);
  });

  it("converts STAKE_DELEGATION with pool keyhash", () => {
    const cert = certificatePrototypeToCardano(
      {
        type: "STAKE_DELEGATION",
        value: {
          stake_credential: { type: "KEY", value: KEY_HASH },
          pool_keyhash: POOL_KEY_HASH,
        },
      },
      0,
    );
    const core = cert.toCore() as { stakeCredential: { hash: string }; poolId: string };
    expect(core.stakeCredential.hash.toString()).toEqual(KEY_HASH);
    expect(core.poolId.toString()).toContain("pool1");
  });

  it("converts POOL_RETIREMENT with epoch", () => {
    const cert = certificatePrototypeToCardano(
      { type: "POOL_RETIREMENT", value: { pool_keyhash: POOL_KEY_HASH, epoch: 450n } },
      0,
    );
    const core = cert.toCore() as { epoch: number };
    expect(core.epoch).toEqual(450);
  });

  it("converts VOTE_DELEGATION to always-abstain", () => {
    const cert = certificatePrototypeToCardano(
      {
        type: "VOTE_DELEGATION",
        value: {
          stake_credential: { type: "KEY", value: KEY_HASH },
          drep: { type: "ALWAYS_ABSTAIN" },
        },
      },
      0,
    );
    const core = cert.toCore() as { stakeCredential: { hash: string }; dRep: unknown };
    expect(core.stakeCredential.hash.toString()).toEqual(KEY_HASH);
    expect(core.dRep).toBeDefined();
  });

  it("round-trips a DRep key hash through DREP_REGISTRATION", () => {
    const cert = certificatePrototypeToCardano(
      {
        type: "DREP_REGISTRATION",
        value: { voting_credential: { type: "KEY", value: KEY_HASH }, coin: "500000000" },
      },
      0,
    );
    const core = cert.toCore() as { deposit: bigint; dRepCredential: { hash: string } };
    expect(core.deposit).toEqual(500000000n);
    expect(core.dRepCredential.hash.toString()).toEqual(KEY_HASH);
  });

  // Regression for a bug in `utils/certificate.ts` (shared with the v1 MeshTxBuilder): the
  // `StakeVoteRegistrationAndDelegation` branch emitted `newStakeVoteDelegationCert`
  // (CDDL certificate 10, no deposit) instead of `newStakeVoteRegistrationDelegationCert`
  // (CDDL certificate 13). The two were byte-identical and the `coin` was silently dropped, while
  // the builder's `getTotalDeposit()` still charged it — so the balance included a deposit the
  // certificate never declared, and the stake credential was never registered.
  describe("STAKE_VOTE_REGISTRATION_AND_DELEGATION (CDDL cert 13)", () => {
    const build = (coin: string) =>
      certificatePrototypeToCardano(
        {
          type: "STAKE_VOTE_REGISTRATION_AND_DELEGATION",
          value: {
            stake_credential: { type: "KEY", value: KEY_HASH },
            pool_keyhash: POOL_KEY_HASH,
            drep: { type: "ALWAYS_ABSTAIN" },
            coin,
          },
        },
        0,
      );

    it("emits a registration-delegation certificate, not a plain delegation", () => {
      const core = build("2000000").toCore() as { __typename: string };
      expect(core.__typename).toEqual("StakeVoteRegistrationDelegateCertificate");
    });

    it("carries the deposit", () => {
      const core = build("2000000").toCore() as { deposit: bigint };
      expect(core.deposit).toEqual(2000000n);
    });

    it("is distinct from STAKE_AND_VOTE_DELEGATION (cert 10)", () => {
      const cert10 = certificatePrototypeToCardano(
        {
          type: "STAKE_AND_VOTE_DELEGATION",
          value: {
            stake_credential: { type: "KEY", value: KEY_HASH },
            pool_keyhash: POOL_KEY_HASH,
            drep: { type: "ALWAYS_ABSTAIN" },
          },
        },
        0,
      );
      expect(build("2000000").toCbor()).not.toEqual(cert10.toCbor());
    });

    it.each(["ALWAYS_ABSTAIN", "ALWAYS_NO_CONFIDENCE"] as const)(
      "carries the deposit for DRep variant %s",
      (drepType) => {
        const cert = certificatePrototypeToCardano(
          {
            type: "STAKE_VOTE_REGISTRATION_AND_DELEGATION",
            value: {
              stake_credential: { type: "KEY", value: KEY_HASH },
              pool_keyhash: POOL_KEY_HASH,
              drep: { type: drepType },
              coin: "3000000",
            },
          },
          0,
        );
        expect((cert.toCore() as { deposit: bigint }).deposit).toEqual(3000000n);
      },
    );
  });

});
