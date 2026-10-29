import type { TransactionPrototype } from "@meshsdk/common";
import {
  applyCborEncoding,
  deserializeAddress,
  GovernanceActionKind,
  IFetcher,
  mConStr0,
  MeshTxBuilder,
  NativeScript,
  resolveNativeScriptAddress,
  resolveNativeScriptHash,
  resolveNativeScriptHex,
  resolvePlutusScriptAddress,
  UTxO,
} from "@meshsdk/core";
import {
  Cardano,
  deserializeTx,
  scriptHashToRewardAddress,
  transactionPrototypeFromHex,
  transactionPrototypeToHex,
} from "@meshsdk/core-cst";
import { MeshWallet } from "@meshsdk/wallet";

import {
  TxEmulator,
  TxEmulatorOptions,
  TxRejectedError,
  TxResult,
  TxValidator,
} from "../src";

const alwaysSucceed = {
  code: applyCborEncoding(
    "58340101002332259800a518a4d153300249011856616c696461746f722072657475726e65642066616c736500136564004ae715cd01",
  ),
  version: "V3" as const,
};
const alwaysFail = {
  code: applyCborEncoding("5001010023259800b452689b2b20025735"),
  version: "V3" as const,
};
const lovelace = (quantity: string) => [{ unit: "lovelace", quantity }];
const outRef = (n: number) => ({
  txHash: String(n).repeat(64),
  outputIndex: 0,
});
const anchor = {
  anchor_url: "https://example.com/a.json",
  anchor_data_hash: "cd".repeat(32),
};

// A native script with no conditions: it needs no signature, so transactions it witnesses are
// valid unsigned and chains of them can be built and played without keys
const openScript: NativeScript = { type: "all", scripts: [] };
const openScriptHex = resolveNativeScriptHex(openScript);
const openHash = resolveNativeScriptHash(openScript);
const openAddress = resolveNativeScriptAddress(openScript, 1);
const openStake = scriptHashToRewardAddress(openHash, 1);
const openCredential = { type: "SCRIPT", value: openHash };
const openDRep = Cardano.DRepID.cip129FromCredential({
  type: Cardano.CredentialType.ScriptHash,
  hash: openHash as never,
}).toString();
const OPEN_FUNDS = 300_000_000_000n;
const poolHash = "ab".repeat(28);
const poolId = Cardano.PoolId.fromKeyHash(poolHash as never).toString();
const GOV_DEPOSIT = 100_000_000_000n;

/**
 * A balanced transaction spending an open-script output into one change output. `delta` is
 * what leaves it besides the fee and the change (deposits, donations) less what enters
 * (refunds, withdrawals).
 */
const rawTx = ({
  input = outRef(2),
  inputValue = OPEN_FUNDS,
  fee = 2_000_000n,
  delta = 0n,
  body = {},
  isValid = true,
}: {
  input?: { txHash: string; outputIndex: number };
  inputValue?: bigint;
  fee?: bigint;
  delta?: bigint;
  body?: Record<string, unknown>;
  isValid?: boolean;
}) =>
  transactionPrototypeToHex({
    body: {
      inputs: [{ transaction_id: input.txHash, index: input.outputIndex }],
      outputs: [
        {
          address: openAddress,
          amount: { coin: String(inputValue - fee - delta) },
        },
      ],
      fee: String(fee),
      ...body,
    },
    is_valid: isValid,
    witness_set: {
      native_scripts: [{ type: "SCRIPT_ALL", value: { native_scripts: [] } }],
    },
  } as unknown as TransactionPrototype);

/** The largest open-script output, which a chain of raw transactions continues from */
const nextOpen = (emulator: TxEmulator) => {
  const [utxo] = emulator
    .utxos({ address: openAddress })
    .map((u) => ({
      input: u.input,
      inputValue: BigInt(u.output.amount[0]!.quantity),
    }))
    .sort((a, b) => (b.inputValue > a.inputValue ? 1 : -1));
  return utxo!;
};

const rules = (result: TxResult) =>
  result.accepted ? [] : result.errors.map((e) => e.rule);

const warningRules = (result: TxResult) => result.warnings.map((w) => w.rule);

const expectAccepted = (result: TxResult) => {
  expect(rules(result)).toEqual([]);
  return result as Extract<TxResult, { accepted: true }>;
};

/** The test wallet's payment key hash, which also stands for a pool operator */
const walletKeyHash = (async () => {
  const wallet = new MeshWallet({
    networkId: 1,
    key: { type: "mnemonic", words: Array(24).fill("solution") },
  });
  await wallet.init();
  return deserializeAddress((await wallet.getChangeAddress())!).pubKeyHash;
})();

async function setup(
  validator: TxValidator,
  options: Partial<TxEmulatorOptions> = {},
) {
  const wallet = new MeshWallet({
    networkId: 1,
    key: { type: "mnemonic", words: Array(24).fill("solution") },
  });
  await wallet.init();
  const stakeWallet = new MeshWallet({
    networkId: 1,
    key: { type: "mnemonic", words: Array(24).fill("solution") },
    accountType: "stake",
  });
  await stakeWallet.init();
  const address = (await wallet.getChangeAddress())!;
  const [stake] = await wallet.getRewardAddresses();
  const { pubKeyHash } = deserializeAddress(address);
  const funding: UTxO = {
    input: outRef(0),
    output: { address, amount: lovelace("10000000000") },
  };
  const collateral: UTxO = {
    input: outRef(1),
    output: { address, amount: lovelace("5000000") },
  };
  const open: UTxO = {
    input: outRef(2),
    output: { address: openAddress, amount: lovelace(String(OPEN_FUNDS)) },
  };
  const emulator = await TxEmulator.create({
    validator,
    ...options,
    utxos: [funding, collateral, open, ...(options.utxos ?? [])],
  });
  const params = await emulator.fetchProtocolParameters();
  const builder = ({ evaluate = true } = {}) =>
    new MeshTxBuilder({
      fetcher: emulator,
      ...(evaluate && { evaluator: emulator }),
      params,
    });
  const send = (quantity = "2000000") =>
    builder()
      .txOut(address, lovelace(quantity))
      .changeAddress(address)
      .selectUtxosFrom([funding])
      .complete();
  /** A builder spending from the open script, as transactions to chain start out */
  const fromOpen = (utxo: UTxO = open, { evaluate = true } = {}) =>
    builder({ evaluate })
      .txIn(
        utxo.input.txHash,
        utxo.input.outputIndex,
        utxo.output.amount,
        openAddress,
        0,
      )
      .txInScript(openScriptHex)
      .changeAddress(openAddress);
  const next = () =>
    fromOpen(
      emulator
        .utxos({ address: openAddress })
        .sort((a, b) =>
          BigInt(b.output.amount[0]!.quantity) >
          BigInt(a.output.amount[0]!.quantity)
            ? 1
            : -1,
        )[0]!,
    );
  /** Signed with the wallet's payment key, and its stake key */
  const sign = async (txHex: string) =>
    stakeWallet.signTx(await wallet.signTx(txHex, true), true);
  return {
    wallet,
    address,
    stake: stake!,
    pubKeyHash,
    funding,
    collateral,
    open,
    emulator,
    builder,
    send,
    fromOpen,
    next,
    sign,
  };
}

describe.each(["scalus", "cquisitor"] as const)(
  "TxEmulator (%s)",
  (validator) => {
    it("needs a validator", async () => {
      await expect(TxEmulator.create({} as TxEmulatorOptions)).rejects.toThrow(
        "validator",
      );
    });

    it("emulates mainnet unless told otherwise", async () => {
      const { emulator } = await setup(validator);
      expect(emulator.network).toBe("mainnet");
      const preview = await TxEmulator.create({
        validator,
        network: "preview",
      });
      expect(preview.network).toBe("preview");
      // Preview epochs are a day long
      const start = preview.advanceTo({ epoch: preview.epoch + 1 });
      expect(preview.advanceTo({ slot: start + 86_400 })).toBe(start + 86_400);
      expect(preview.epoch).toBe(Math.floor(start / 86_400) + 1);
    });

    it("takes protocol parameters, all or some", async () => {
      const emulator = await TxEmulator.create({
        validator,
        params: { minFeeA: 45, keyDeposit: 3_000_000 },
      });
      const params = await emulator.fetchProtocolParameters();
      expect(params.minFeeA).toBe(45);
      expect(params.keyDeposit).toBe(3_000_000);
    });

    it("reports the protocol parameters it checks transactions with", async () => {
      const { emulator, wallet, pubKeyHash, stake, address, funding } =
        await setup(validator);
      // Mainnet's, where Mesh's defaults differ
      expect(await emulator.fetchProtocolParameters()).toMatchObject({
        minPoolCost: "170000000",
        maxBlockSize: 90112,
        maxBlockExMem: "72000000",
        maxBlockExSteps: "20000000000",
      });
      const fork = emulator.fork();
      fork.setProtocolParameters({
        minPoolCost: "100000000",
        maxBlockHeaderSize: 1200,
      });
      expect(await fork.fetchProtocolParameters()).toMatchObject({
        minPoolCost: "100000000",
        maxBlockHeaderSize: 1200,
      });

      // A pool costing 200 ADA, above mainnet's minimum and below Mesh's default, passes on a
      // ledger read back from this one too
      const registration = await wallet.signTx(
        await new MeshTxBuilder({
          fetcher: emulator,
          params: await emulator.fetchProtocolParameters(),
        })
          .registerPoolCertificate({
            vrfKeyHash: "11".repeat(32),
            operator: pubKeyHash,
            pledge: "0",
            cost: "200000000",
            margin: [1, 100],
            relays: [],
            owners: [pubKeyHash],
            rewardAddress: stake,
          })
          .selectUtxosFrom([funding])
          .changeAddress(address)
          .complete(),
        true,
      );
      expectAccepted(await emulator.simulate(registration));
      const copy = await TxEmulator.fromChain(registration, {
        validator,
        fetcher: emulator,
      });
      expectAccepted(await copy.simulate(registration));
    });

    it("simulates a transaction without changing the ledger", async () => {
      const { wallet, address, funding, emulator, send } =
        await setup(validator);
      const result = expectAccepted(
        await emulator.simulate(await wallet.signTx(await send())),
      );

      expect(BigInt(result.fee)).toBeGreaterThan(0n);
      expect(result.consumed).toEqual([funding]);
      expect(result.produced).toHaveLength(2);
      expect(
        result.produced.every((u) => u.input.txHash === result.txHash),
      ).toBe(true);
      expect(emulator.utxos({ address })).toHaveLength(2);
    });

    it("applies an accepted transaction on submit, listing what it produced", async () => {
      const { wallet, address, emulator, send } = await setup(validator);
      const signed = await wallet.signTx(await send());

      const result = expectAccepted(await emulator.submit(signed));

      expect(emulator.utxos({ txHash: result.txHash })).toEqual(
        result.produced,
      );
      expect(emulator.utxos({ address })).toHaveLength(3);
      expect(rules(await emulator.simulate(signed))).toEqual([
        "UtxoNotAvailable",
      ]);
    });

    it("is a fetcher, evaluator and submitter for building on it", async () => {
      const { wallet, address, funding, emulator } = await setup(validator);
      const txHex = await new MeshTxBuilder({
        fetcher: emulator,
        evaluator: emulator,
        submitter: emulator,
        params: await emulator.fetchProtocolParameters(),
      })
        .txOut(address, lovelace("2000000"))
        .changeAddress(address)
        .selectUtxosFrom([funding])
        .complete();
      const signed = await wallet.signTx(txHex);

      const txHash = await emulator.submitTx(signed);
      expect(await emulator.fetchUTxOs(txHash)).toHaveLength(2);
      expect(await emulator.fetchAddressUTxOs(address)).toHaveLength(3);
      const error = await emulator.submitTx(signed).catch((e) => e);
      expect(error).toBeInstanceOf(TxRejectedError);
      expect(rules((error as TxRejectedError).result)).toEqual([
        "UtxoNotAvailable",
      ]);
    });

    it("checks concurrent submissions one at a time", async () => {
      const { wallet, emulator, send } = await setup(validator);
      // Two transactions spending the same output
      const [first, second] = await Promise.all([
        send("2000000").then((tx) => wallet.signTx(tx)),
        send("3000000").then((tx) => wallet.signTx(tx)),
      ]);

      const results = await Promise.all([
        emulator.submit(first),
        emulator.submit(second),
      ]);

      expect(results.map((r) => r.accepted)).toEqual([true, false]);
      expect(rules(results[1]!)).toEqual(["UtxoNotAvailable"]);
    });

    it("reports missing signatures, and junk", async () => {
      const { emulator, send } = await setup(validator);
      const unsigned = await send();

      expect(rules(await emulator.simulate(unsigned))).toEqual([
        validator === "scalus" ? "MissingKeyHashes" : "MissingVKeyWitnesses",
      ]);
      for (const junk of [
        "00",
        { body: {} } as unknown as TransactionPrototype,
      ])
        expect(await emulator.submit(junk)).toMatchObject({
          accepted: false,
          errors: [{ rule: "InvalidTransaction" }],
        });
      if (validator === "cquisitor") {
        expectAccepted(
          await emulator.simulate(unsigned, { requireSignatures: false }),
        );
      } else {
        await expect(
          emulator.simulate(unsigned, { requireSignatures: false }),
        ).rejects.toThrow("cquisitor");
      }
    });

    it("reports script budgets, and script failures as phase 2", async () => {
      const locked = (
        outputIndex: number,
        script: typeof alwaysSucceed,
      ): UTxO => ({
        input: { txHash: "9".repeat(64), outputIndex },
        output: {
          address: resolvePlutusScriptAddress(script, 1),
          amount: lovelace("20000000"),
          plutusData: "d87980",
        },
      });
      const { wallet, address, collateral, emulator, builder } = await setup(
        validator,
        { utxos: [locked(0, alwaysSucceed), locked(1, alwaysFail)] },
      );
      const spend = (
        outputIndex: number,
        script: typeof alwaysSucceed,
        evaluate: boolean,
      ) =>
        builder({ evaluate })
          .spendingPlutusScriptV3()
          .txIn("9".repeat(64), outputIndex)
          .txInInlineDatumPresent()
          .txInRedeemerValue(mConStr0([]), "Mesh", {
            mem: 1_000_000,
            steps: 500_000_000,
          })
          .txInScript(script.code)
          .txInCollateral(
            collateral.input.txHash,
            collateral.input.outputIndex,
            collateral.output.amount,
            collateral.output.address,
          )
          .changeAddress(address)
          .complete();

      const passing = expectAccepted(
        await emulator.simulate(
          await wallet.signTx(await spend(0, alwaysSucceed, true)),
        ),
      );
      expect(passing.redeemers).toEqual([
        { tag: "SPEND", index: 0, budget: expect.any(Object) },
      ]);

      // Built without evaluation, as evaluating would fail before the ledger sees it
      const failing = await emulator.simulate(
        await wallet.signTx(await spend(1, alwaysFail, false)),
      );
      expect(failing.accepted).toBe(false);
      expect(
        !failing.accepted && failing.errors.every((e) => e.phase === 2),
      ).toBe(true);
    });

    it("reports a failing native script as phase 1", async () => {
      // A native script time-locked until long after the ledger's slot
      const timeLocked: NativeScript = {
        type: "all",
        scripts: [{ type: "after", slot: "999999999999" }],
      };
      const lockedAddress = resolveNativeScriptAddress(timeLocked, 1);
      const utxo: UTxO = {
        input: outRef(7),
        output: { address: lockedAddress, amount: lovelace("50000000") },
      };
      const emulator = await TxEmulator.create({ validator, utxos: [utxo] });
      const txHex = await new MeshTxBuilder({
        fetcher: emulator,
        params: await emulator.fetchProtocolParameters(),
      })
        .txIn(utxo.input.txHash, 0, utxo.output.amount, lockedAddress, 0)
        .txInScript(resolveNativeScriptHex(timeLocked))
        .changeAddress(lockedAddress)
        .complete();

      const result = await emulator.simulate(txHex);
      expect(result.accepted).toBe(false);
      expect(!result.accepted && result.errors.map((e) => e.phase)).toEqual([
        1,
      ]);
    });

    it("simulates a TransactionPrototype", async () => {
      const { emulator, fromOpen } = await setup(validator);
      const txHex = await fromOpen().complete();

      expectAccepted(
        await emulator.simulate(transactionPrototypeFromHex(txHex)),
      );
    });

    it("pays to Byron addresses", async () => {
      const { wallet, address, funding, emulator, builder } =
        await setup(validator);
      const byron =
        "Ae2tdPwUPEZFRbyhz3cpfC2CumGzNkFBN2L42rcUc2yjQpEkxDbkPodpMAi";
      const txHex = await builder()
        .txOut(byron, lovelace("2000000"))
        .changeAddress(address)
        .selectUtxosFrom([funding])
        .complete();

      const result = expectAccepted(
        await emulator.submit(await wallet.signTx(txHex)),
      );

      expect(result.produced.map((u) => u.output.address)).toContain(byron);
      expect(emulator.utxos({ address: byron })).toHaveLength(1);
    });

    it("forks the ledger into independent copies", async () => {
      const { wallet, address, emulator, send } = await setup(validator);
      const signed = await wallet.signTx(await send());
      const fork = emulator.fork();

      expectAccepted(await fork.submit(signed));
      expect(fork.utxos({ address })).toHaveLength(3);
      expect(emulator.utxos({ address })).toHaveLength(2);
      expectAccepted(await emulator.submit(signed));
    });

    it("moves the clock forward only, and rejects an expired transaction", async () => {
      const { wallet, address, funding, emulator, builder } =
        await setup(validator);
      const epoch = emulator.epoch;
      const slot = emulator.advanceTo({ epoch: epoch + 1 });
      expect(emulator.epoch).toBe(epoch + 1);
      expect(() => emulator.advanceTo({ epoch })).toThrow("forward");
      expect(emulator.advanceTo({ time: emulator.time + 10_000 })).toBe(
        slot + 10,
      );

      const ttl = emulator.slot + 100;
      const expiring = await wallet.signTx(
        await builder()
          .txOut(address, lovelace("2000000"))
          .invalidHereafter(ttl)
          .changeAddress(address)
          .selectUtxosFrom([funding])
          .complete(),
      );
      emulator.advanceTo({ slot: ttl - 1 });
      expectAccepted(await emulator.simulate(expiring));
      emulator.advanceTo({ slot: ttl });
      expect(rules(await emulator.simulate(expiring))).toEqual([
        validator === "scalus"
          ? "TransactionExpired"
          : "OutsideValidityIntervalUTxO",
      ]);
    });

    it("chains transactions: each sees the UTxOs and registrations of those before", async () => {
      const { emulator, next } = await setup(validator, {
        pools: [{ poolId: poolHash }],
      });

      expectAccepted(
        await emulator.submit(
          await next().registerStakeCertificate(openStake).complete(),
        ),
      );
      expect(await emulator.fetchAccountInfo(openStake)).toMatchObject({
        active: true,
        deposit: "2000000",
        rewards: "0",
      });

      expectAccepted(
        await emulator.submit(
          await next()
            .delegateStakeCertificate(openStake, poolHash)
            .certificateScript(openScriptHex)
            .complete(),
        ),
      );
      expect((await emulator.fetchAccountInfo(openStake)).poolId).toBe(poolId);

      expectAccepted(
        await emulator.submit(
          await next()
            .deregisterStakeCertificate(openStake)
            .certificateScript(openScriptHex)
            .complete(),
        ),
      );
      expect((await emulator.fetchAccountInfo(openStake)).active).toBe(false);
    });

    it("retires a seeded pool, undelegating its stake and paying its deposit back", async () => {
      const { emulator, pubKeyHash, sign } = await setup(validator, {
        accounts: [{ rewardAddress: openStake }],
      });
      // A pool registered on this ledger, its deposit going back to the open script's stake
      const poolParams = {
        operator: pubKeyHash,
        vrf_keyhash: "11".repeat(32),
        pledge: "0",
        cost: "340000000",
        margin: { numerator: "1", denominator: "100" },
        reward_account: openStake,
        pool_owners: [pubKeyHash],
        relays: [],
        pool_metadata: null,
      };
      expectAccepted(
        await emulator.submit(
          await sign(
            rawTx({
              delta: 500_000_000n,
              body: {
                certs: [
                  {
                    type: "POOL_REGISTRATION",
                    value: { pool_params: poolParams },
                  },
                  {
                    type: "STAKE_DELEGATION",
                    value: {
                      stake_credential: openCredential,
                      pool_keyhash: pubKeyHash,
                    },
                  },
                ],
              },
            }),
          ),
        ),
      );
      expect(await emulator.fetchPoolState(pubKeyHash)).toMatchObject({
        registered: true,
        deposit: "500000000",
      });

      const retirementEpoch = emulator.epoch + 1;
      expectAccepted(
        await emulator.submit(
          await sign(
            rawTx({
              ...nextOpen(emulator),
              body: {
                certs: [
                  {
                    type: "POOL_RETIREMENT",
                    value: {
                      pool_keyhash: pubKeyHash,
                      epoch: BigInt(retirementEpoch),
                    },
                  },
                ],
              },
            }),
          ),
        ),
      );
      expect((await emulator.fetchPoolState(pubKeyHash)).retirementEpoch).toBe(
        retirementEpoch,
      );

      emulator.advanceTo({ epoch: retirementEpoch });
      expect((await emulator.fetchPoolState(pubKeyHash)).registered).toBe(
        false,
      );
      const account = await emulator.fetchAccountInfo(openStake);
      expect(account.poolId).toBeUndefined();
      expect(account.rewards).toBe("500000000");
    });

    it("retires a pool given at creation", async () => {
      const operator = await walletKeyHash;
      const { emulator, pubKeyHash, sign } = await setup(validator, {
        pools: [{ poolId: operator }],
      });
      const retire = await sign(
        rawTx({
          body: {
            certs: [
              {
                type: "POOL_RETIREMENT",
                value: {
                  pool_keyhash: pubKeyHash,
                  epoch: BigInt(emulator.epoch + 1),
                },
              },
            ],
          },
        }),
      );

      expectAccepted(await emulator.submit(retire));
    });

    it("expires governance actions, returning their deposits", async () => {
      const { emulator } = await setup(validator, {
        accounts: [{ rewardAddress: openStake }],
      });
      const proposal = expectAccepted(
        await emulator.submit(
          rawTx({
            delta: GOV_DEPOSIT,
            body: {
              voting_proposals: [
                {
                  anchor,
                  deposit: String(GOV_DEPOSIT),
                  reward_account: openStake,
                  governance_action: { type: "INFO_ACTION" },
                },
              ],
            },
          }),
        ),
      );
      const action = await emulator.fetchGovernanceProposal(proposal.txHash, 0);
      // Mainnet actions stay open to votes for six epochs after the one they are proposed in
      expect(action.expiration).toBe(emulator.epoch + 7);

      emulator.advanceTo({ epoch: action.expiration });
      expect(
        (await emulator.fetchGovernanceProposal(proposal.txHash, 0))
          .expiredEpoch,
      ).toBe(action.expiration);
      emulator.advanceTo({ epoch: action.expiration + 1 });
      await expect(
        emulator.fetchGovernanceProposal(proposal.txHash, 0),
      ).rejects.toThrow("not in the ledger");
      expect((await emulator.fetchAccountInfo(openStake)).rewards).toBe(
        String(GOV_DEPOSIT),
      );
    });

    it("removes the actions following an expired one, returning their deposits", async () => {
      const { emulator } = await setup(validator, {
        accounts: [{ rewardAddress: openStake }],
      });
      const propose = (previous?: string) =>
        emulator.submit(
          rawTx({
            ...nextOpen(emulator),
            delta: GOV_DEPOSIT,
            body: {
              voting_proposals: [
                {
                  anchor,
                  deposit: String(GOV_DEPOSIT),
                  reward_account: openStake,
                  governance_action: {
                    type: "NO_CONFIDENCE_ACTION",
                    value: previous
                      ? {
                          gov_action_id: { transaction_id: previous, index: 0 },
                        }
                      : {},
                  },
                },
              ],
            },
          }),
        );
      const first = expectAccepted(await propose());
      emulator.advanceTo({ epoch: emulator.epoch + 1 });
      const second = expectAccepted(await propose(first.txHash));
      const { expiration } = await emulator.fetchGovernanceProposal(
        first.txHash,
        0,
      );

      // The first expires a boundary before the second would
      emulator.advanceTo({ epoch: expiration + 1 });
      for (const { txHash } of [first, second])
        await expect(
          emulator.fetchGovernanceProposal(txHash, 0),
        ).rejects.toThrow("not in the ledger");
      expect((await emulator.fetchAccountInfo(openStake)).rewards).toBe(
        String(2n * GOV_DEPOSIT),
      );
    });

    it("adds donations to the treasury at the epoch boundary", async () => {
      const { emulator } = await setup(validator, {
        governance: { treasury: "1000000000" },
      });
      expectAccepted(
        await emulator.submit(
          rawTx({ delta: 10_000_000n, body: { donation: "10000000" } }),
        ),
      );
      expect(await emulator.fetchTreasury()).toBe("1000000000");

      emulator.advanceTo({ epoch: emulator.epoch + 1 });
      expect(await emulator.fetchTreasury()).toBe("1010000000");
    });

    it("undelegates the votes of a DRep that leaves", async () => {
      const { emulator } = await setup(validator, {
        accounts: [{ rewardAddress: openStake, drep: openDRep }],
        dreps: [{ drepId: openDRep }],
      });
      expect((await emulator.fetchAccountInfo(openStake)).drep).toBe(openDRep);

      expectAccepted(
        await emulator.submit(
          rawTx({
            delta: -500_000_000n,
            body: {
              certs: [
                {
                  type: "DREP_DEREGISTRATION",
                  value: {
                    voting_credential: openCredential,
                    coin: "500000000",
                  },
                },
              ],
            },
          }),
        ),
      );

      expect((await emulator.fetchDRepState(openDRep)).registered).toBe(false);
      // Known to delegate its vote to none
      expect((await emulator.fetchAccountInfo(openStake)).drep).toBeNull();
    });

    it("adds and removes outputs without a transaction", async () => {
      const { wallet, address, emulator, builder } = await setup(validator);
      const extra: UTxO = {
        input: outRef(3),
        output: { address, amount: lovelace("7000000") },
      };
      emulator.addUtxos([extra]);
      expect(emulator.utxos({ txHash: extra.input.txHash })).toEqual([extra]);
      const spending = await wallet.signTx(
        await builder()
          .txIn(extra.input.txHash, 0, extra.output.amount, address)
          .changeAddress(address)
          .complete(),
      );
      expectAccepted(await emulator.simulate(spending));

      emulator.removeUtxos([extra.input]);
      expect(emulator.utxos({ txHash: extra.input.txHash })).toEqual([]);
      expect(rules(await emulator.simulate(spending))).toEqual([
        "UtxoNotAvailable",
      ]);
    });

    it("pays out rewards set without a transaction, keeping what is not given", async () => {
      const { emulator, next } = await setup(validator, {
        pools: [{ poolId: poolHash }],
        accounts: [{ rewardAddress: openStake, poolId: poolHash }],
      });
      emulator.setAccount({ rewardAddress: openStake, rewards: "7000000" });
      expect(await emulator.fetchAccountInfo(openStake)).toMatchObject({
        rewards: "7000000",
        poolId,
      });

      expectAccepted(
        await emulator.submit(
          await next()
            .withdrawal(openStake, "7000000")
            .withdrawalScript(openScriptHex)
            .complete(),
        ),
      );
      expect((await emulator.fetchAccountInfo(openStake)).rewards).toBe("0");

      emulator.setAccount({ rewardAddress: openStake, poolId: null });
      expect(
        (await emulator.fetchAccountInfo(openStake)).poolId,
      ).toBeUndefined();
      emulator.removeAccount(openStake);
      expect((await emulator.fetchAccountInfo(openStake)).active).toBe(false);

      // Delegating needs the stake address registered
      const delegation = await next()
        .delegateStakeCertificate(openStake, poolHash)
        .certificateScript(openScriptHex)
        .complete();
      expect((await emulator.simulate(delegation)).accepted).toBe(false);
      emulator.setAccount({ rewardAddress: openStake });
      expectAccepted(await emulator.simulate(delegation));
    });

    it("takes withdrawals off the rewards, which are withdrawn once", async () => {
      const { emulator } = await setup(validator, {
        accounts: [{ rewardAddress: openStake, rewards: "5000000" }],
      });
      const withdraw = (amount: bigint) =>
        rawTx({
          ...nextOpen(emulator),
          delta: -amount,
          body: { withdrawals: { [openStake]: String(amount) } },
        });

      expectAccepted(await emulator.submit(withdraw(5_000_000n)));
      expect((await emulator.fetchAccountInfo(openStake)).rewards).toBe("0");
      expect((await emulator.submit(withdraw(5_000_000n))).accepted).toBe(
        false,
      );
      expect((await emulator.fetchAccountInfo(openStake)).rewards).toBe("0");

      // Nothing is left: withdrawing nothing passes, and so does deregistering
      expectAccepted(await emulator.simulate(withdraw(0n)));
      expectAccepted(
        await emulator.simulate(
          rawTx({
            ...nextOpen(emulator),
            delta: -2_000_000n,
            body: {
              certs: [
                {
                  type: "STAKE_DEREGISTRATION",
                  value: { stake_credential: openCredential },
                },
              ],
            },
          }),
        ),
      );
    });

    it("withdraws the rewards and deregisters in one transaction, unless Scalus checks it", async () => {
      const { emulator } = await setup(validator, {
        accounts: [{ rewardAddress: openStake, rewards: "7000000" }],
      });
      const result = await emulator.simulate(
        rawTx({
          delta: -9_000_000n,
          body: {
            withdrawals: { [openStake]: "7000000" },
            certs: [
              {
                type: "STAKE_DEREGISTRATION",
                value: { stake_credential: openCredential },
              },
            ],
          },
        }),
      );
      // The ledger takes the withdrawal first; Scalus checks the deregistration against the
      // rewards before it (see the README)
      if (validator === "cquisitor") expectAccepted(result);
      else expect(rules(result)).toEqual(["StakeCertificates"]);
    });

    it("applies only the collateral of a transaction marked invalid, not its certificates", async () => {
      const locked: UTxO = {
        input: { txHash: "9".repeat(64), outputIndex: 0 },
        output: {
          address: resolvePlutusScriptAddress(alwaysFail, 1),
          amount: lovelace("20000000"),
          plutusData: "d87980",
        },
      };
      const { wallet, address, collateral, emulator, builder } = await setup(
        validator,
        { utxos: [locked] },
      );
      const txHex = await builder({ evaluate: false })
        .spendingPlutusScriptV3()
        .txIn(locked.input.txHash, 0)
        .txInInlineDatumPresent()
        .txInRedeemerValue(mConStr0([]), "Mesh", {
          mem: 1_000_000,
          steps: 500_000_000,
        })
        .txInScript(alwaysFail.code)
        .txInCollateral(
          collateral.input.txHash,
          0,
          collateral.output.amount,
          address,
        )
        .setTotalCollateral("3000000")
        .setCollateralReturnAddress(address)
        .registerStakeCertificate(openStake)
        .changeAddress(address)
        .complete();
      const tx = deserializeTx(await wallet.signTx(txHex));
      tx.setIsValid(false);

      expect(expectAccepted(await emulator.submit(tx.toCbor())).isValid).toBe(
        false,
      );
      expect((await emulator.fetchAccountInfo(openStake)).active).toBe(false);
      // The registration it carried was not made, so it still can be
      expectAccepted(
        await emulator.simulate(
          rawTx({
            delta: 2_000_000n,
            body: {
              certs: [
                {
                  type: "STAKE_REGISTRATION",
                  value: { stake_credential: openCredential },
                },
              ],
            },
          }),
        ),
      );
    });

    it("re-registers a pool without another deposit, unless Scalus checks it", async () => {
      const { emulator, pubKeyHash, sign } = await setup(validator, {
        accounts: [{ rewardAddress: openStake }],
      });
      const registration = (cost: string, deposit: bigint) =>
        sign(
          rawTx({
            ...nextOpen(emulator),
            delta: deposit,
            body: {
              certs: [
                {
                  type: "POOL_REGISTRATION",
                  value: {
                    pool_params: {
                      operator: pubKeyHash,
                      vrf_keyhash: "11".repeat(32),
                      pledge: "0",
                      cost,
                      margin: { numerator: "1", denominator: "100" },
                      reward_account: openStake,
                      pool_owners: [pubKeyHash],
                      relays: [],
                      pool_metadata: null,
                    },
                  },
                },
              ],
            },
          }),
        );
      expectAccepted(
        await emulator.submit(await registration("340000000", 500_000_000n)),
      );

      const update = await emulator.simulate(
        await registration("400000000", 0n),
      );
      const paying = await emulator.simulate(
        await registration("400000000", 500_000_000n),
      );
      // Scalus charges a re-registration another deposit (see the README)
      if (validator === "cquisitor") {
        expectAccepted(update);
        expect(paying.accepted).toBe(false);
      } else {
        expect(update.accepted).toBe(false);
        expectAccepted(paying);
      }
    });

    it("refuses a withdrawal to a key-hash stake address delegating its vote to no DRep, unless Scalus checks it", async () => {
      const {
        emulator: base,
        stake,
        sign,
        address,
        funding,
        builder,
      } = await setup(validator);
      const emulator = await TxEmulator.create({
        validator,
        utxos: base.utxos(),
        accounts: [{ rewardAddress: stake, rewards: "7000000" }],
      });
      const withdrawal = await sign(
        await builder()
          .withdrawal(stake, "7000000")
          .changeAddress(address)
          .selectUtxosFrom([funding])
          .complete(),
      );

      const result = await emulator.simulate(withdrawal);
      // Scalus does not check DRep delegations (see the README)
      if (validator === "cquisitor")
        expect(rules(result)).toContain(
          "WithdrawalNotAllowedBecauseNotDelegatedToDRep",
        );
      else expectAccepted(result);
      emulator.setAccount({ rewardAddress: stake, drep: "alwaysAbstain" });
      expectAccepted(await emulator.simulate(withdrawal));
    });

    it("registers pools and DReps without a transaction", async () => {
      const operator = await walletKeyHash;
      const { emulator, sign } = await setup(validator);
      const retirement = await sign(
        rawTx({
          body: {
            certs: [
              {
                type: "POOL_RETIREMENT",
                value: {
                  pool_keyhash: operator,
                  epoch: BigInt(emulator.epoch + 1),
                },
              },
            ],
          },
        }),
      );
      const leaving = rawTx({
        delta: -500_000_000n,
        body: {
          certs: [
            {
              type: "DREP_DEREGISTRATION",
              value: { voting_credential: openCredential, coin: "500000000" },
            },
          ],
        },
      });
      expect((await emulator.simulate(retirement)).accepted).toBe(false);
      expect((await emulator.simulate(leaving)).accepted).toBe(false);

      emulator.setPool({ poolId: operator });
      emulator.setDRep({ drepId: openDRep });
      emulator.setAccount({
        rewardAddress: openStake,
        poolId: operator,
        drep: openDRep,
      });
      expectAccepted(await emulator.simulate(retirement));
      expectAccepted(await emulator.simulate(leaving));

      // Removing them undelegates the stake and the votes delegated to them
      emulator.removePool(operator);
      emulator.removeDRep(openDRep);
      const account = await emulator.fetchAccountInfo(openStake);
      expect(account.poolId).toBeUndefined();
      expect(account.drep).toBeNull();
      expect((await emulator.simulate(retirement)).accepted).toBe(false);
      expect((await emulator.simulate(leaving)).accepted).toBe(false);
    });

    it("pays a pool's deposit back to the stake address set for it, withdrawable", async () => {
      const { emulator } = await setup(validator, {
        accounts: [{ rewardAddress: openStake }],
      });
      const retirementEpoch = emulator.epoch + 1;
      emulator.setPool({
        poolId: poolHash,
        rewardAddress: openStake,
        retirementEpoch,
      });

      emulator.advanceTo({ epoch: retirementEpoch });
      expect((await emulator.fetchPoolState(poolHash)).registered).toBe(false);
      expect((await emulator.fetchAccountInfo(openStake)).rewards).toBe(
        "500000000",
      );
      expectAccepted(
        await emulator.submit(
          rawTx({
            delta: -500_000_000n,
            body: { withdrawals: { [openStake]: "500000000" } },
          }),
        ),
      );
    });

    it("changes protocol parameters without a transaction", async () => {
      const { wallet, emulator, send } = await setup(validator);
      const signed = await wallet.signTx(await send());
      const fork = emulator.fork();

      emulator.setProtocolParameters({ minFeeA: 4_400 });
      expect((await emulator.fetchProtocolParameters()).minFeeA).toBe(4_400);
      expect((await emulator.simulate(signed)).accepted).toBe(false);

      // A fork keeps the parameters it was made with
      expect((await fork.fetchProtocolParameters()).minFeeA).toBe(44);
      expectAccepted(await fork.simulate(signed));
    });

    it("refuses state it cannot hold", async () => {
      const { emulator } = await setup(validator);
      expect(() =>
        emulator.setAccount({
          rewardAddress: scriptHashToRewardAddress(openHash, 0),
        }),
      ).toThrow("network");
      expect(() =>
        emulator.setLastEnacted({
          transactionId: "a".repeat(64),
          govActionIndex: 0,
          kind: GovernanceActionKind.InfoAction,
        }),
      ).toThrow("last enacted");
    });

    it("changes no state while a transaction is being checked", async () => {
      const { wallet, emulator, send } = await setup(validator);
      const submission = emulator.submit(await wallet.signTx(await send()));
      expect(() => emulator.setTreasury("1000000000")).toThrow("await");
      expect(() => emulator.advanceTo({ slot: emulator.slot + 1 })).toThrow(
        "await",
      );

      expectAccepted(await submission);
      emulator.setTreasury("1000000000");
      expect(await emulator.fetchTreasury()).toBe("1000000000");
    });
  },
);

describe("TxEmulator (cquisitor) ledger rules", () => {
  it("checks what Scalus does not: the pools and DReps delegated to exist", async () => {
    const { emulator, fromOpen } = await setup("cquisitor", {
      accounts: [{ rewardAddress: openStake }],
    });

    const toPool = await emulator.simulate(
      await fromOpen()
        .delegateStakeCertificate(openStake, poolHash)
        .certificateScript(openScriptHex)
        .complete(),
    );
    expect(rules(toPool)).toContain("StakePoolNotRegistered");

    const toDRep = await emulator.simulate(
      await fromOpen()
        .voteDelegationCertificate({ dRepId: openDRep }, openStake)
        .certificateScript(openScriptHex)
        .complete(),
    );
    expect(rules(toDRep)).toContain("DelegateeDRepNotRegistered");
  });

  it("delegates votes to AlwaysAbstain and AlwaysNoConfidence", async () => {
    const { emulator } = await setup("cquisitor", {
      accounts: [{ rewardAddress: openStake }],
    });
    for (const drep of ["ALWAYS_ABSTAIN", "ALWAYS_NO_CONFIDENCE"])
      expectAccepted(
        await emulator.simulate(
          rawTx({
            body: {
              certs: [
                {
                  type: "VOTE_DELEGATION",
                  value: {
                    stake_credential: openCredential,
                    drep: { type: drep },
                  },
                },
              ],
            },
          }),
        ),
      );
  });

  it("chains a DRep registration, a vote delegation, a proposal and a vote on it", async () => {
    const { emulator, next } = await setup("cquisitor", {
      accounts: [{ rewardAddress: openStake }],
    });

    expectAccepted(
      await emulator.submit(
        await next()
          .drepRegistrationCertificate(openDRep)
          .certificateScript(openScriptHex)
          .complete(),
      ),
    );
    expect(await emulator.fetchDRepState(openDRep)).toEqual({
      drepId: openDRep,
      registered: true,
      deposit: "500000000",
    });

    expectAccepted(
      await emulator.submit(
        await next()
          .voteDelegationCertificate({ dRepId: openDRep }, openStake)
          .certificateScript(openScriptHex)
          .complete(),
      ),
    );
    expect((await emulator.fetchAccountInfo(openStake)).drep).toBe(openDRep);

    const proposal = expectAccepted(
      await emulator.submit(
        await next()
          .proposal(
            { kind: "InfoAction", action: {} },
            {
              anchorUrl: "https://example.com/p.json",
              anchorDataHash: "cd".repeat(32),
            },
            openStake,
          )
          .complete(),
      ),
    );
    expect(
      await emulator.fetchGovernanceProposal(proposal.txHash, 0),
    ).toMatchObject({
      governanceType: GovernanceActionKind.InfoAction,
      returnAddress: openStake,
    });

    const vote = (txHash: string) =>
      next()
        .vote(
          { type: "DRep", drepId: openDRep },
          { txHash, txIndex: 0 },
          { voteKind: "Yes" },
        )
        .voteScript(openScriptHex)
        .complete();
    expectAccepted(await emulator.submit(await vote(proposal.txHash)));
    expect(
      rules(await emulator.simulate(await vote("e".repeat(64)))),
    ).toContain("GovActionsDoNotExist");
  });

  it("lets a DRep registered in a transaction vote in it", async () => {
    const { emulator } = await setup("cquisitor", {
      governance: {
        actions: [
          {
            transactionId: "e".repeat(64),
            govActionIndex: 0,
            kind: GovernanceActionKind.InfoAction,
          },
        ],
      },
    });
    expectAccepted(
      await emulator.simulate(
        rawTx({
          delta: 500_000_000n,
          body: {
            certs: [
              {
                type: "DREP_REGISTRATION",
                value: { voting_credential: openCredential, coin: "500000000" },
              },
            ],
            voting_procedures: [
              {
                voter: { type: "DREP", value: openCredential },
                votes: [
                  {
                    action_id: { transaction_id: "e".repeat(64), index: 0 },
                    voting_procedure: { vote: { type: "YES" } },
                  },
                ],
              },
            ],
          },
        }),
      ),
    );
  });

  it("rejects registering a registered DRep", async () => {
    const { emulator } = await setup("cquisitor", {
      dreps: [{ drepId: openDRep }],
    });
    const result = await emulator.simulate(
      rawTx({
        delta: 500_000_000n,
        body: {
          certs: [
            {
              type: "DREP_REGISTRATION",
              value: { voting_credential: openCredential, coin: "500000000" },
            },
          ],
        },
      }),
    );
    expect(result.accepted).toBe(false);
  });

  it("lets sitting committee members vote with their hot credential", async () => {
    const actionHash = "e".repeat(64);
    const { emulator } = await setup("cquisitor", {
      governance: {
        actions: [
          {
            transactionId: actionHash,
            govActionIndex: 0,
            kind: GovernanceActionKind.InfoAction,
          },
        ],
        committee: [
          {
            cold: { type: "KeyHash", keyHash: "c0".repeat(28) },
            hot: { type: "ScriptHash", scriptHash: openHash },
            resigned: false,
          },
        ],
      },
    });
    expectAccepted(
      await emulator.simulate(
        rawTx({
          body: {
            voting_procedures: [
              {
                voter: {
                  type: "CONSTITUTIONAL_COMMITTEE_HOT_CRED",
                  value: openCredential,
                },
                votes: [
                  {
                    action_id: { transaction_id: actionHash, index: 0 },
                    voting_procedure: { vote: { type: "YES" } },
                  },
                ],
              },
            ],
          },
        }),
      ),
    );
  });

  it("refuses votes from committee members not yet elected", async () => {
    const actionHash = "e".repeat(64);
    const { emulator } = await setup("cquisitor", {
      governance: {
        actions: [
          {
            transactionId: actionHash,
            govActionIndex: 0,
            kind: GovernanceActionKind.InfoAction,
          },
        ],
        // Proposed by a pending committee update, with a hot credential authorised
        committee: [
          {
            cold: { type: "KeyHash", keyHash: "c0".repeat(28) },
            hot: { type: "ScriptHash", scriptHash: openHash },
            resigned: false,
            potential: true,
          },
        ],
      },
    });
    const result = await emulator.simulate(
      rawTx({
        body: {
          voting_procedures: [
            {
              voter: {
                type: "CONSTITUTIONAL_COMMITTEE_HOT_CRED",
                value: openCredential,
              },
              votes: [
                {
                  action_id: { transaction_id: actionHash, index: 0 },
                  voting_procedure: { vote: { type: "YES" } },
                },
              ],
            },
          ],
        },
      }),
    );
    expect(rules(result)).toContain("UnelectedCommitteeVoters");
  });

  it("lets stake pools vote on changes to security-group parameters only", async () => {
    const operator = await walletKeyHash;
    const { emulator, pubKeyHash, sign } = await setup("cquisitor", {
      accounts: [{ rewardAddress: openStake }],
      pools: [{ poolId: operator }],
    });
    const spoVote = async (field: string, value: unknown) => {
      const fork = emulator.fork();
      const proposal = expectAccepted(
        await fork.submit(
          rawTx({
            delta: GOV_DEPOSIT,
            body: {
              voting_proposals: [
                {
                  anchor,
                  deposit: String(GOV_DEPOSIT),
                  reward_account: openStake,
                  governance_action: {
                    type: "PARAMETER_CHANGE_ACTION",
                    value: { protocol_param_updates: { [field]: value } },
                  },
                },
              ],
            },
          }),
        ),
      );
      return fork.simulate(
        await sign(
          rawTx({
            ...nextOpen(fork),
            body: {
              voting_procedures: [
                {
                  voter: { type: "STAKING_POOL", value: pubKeyHash },
                  votes: [
                    {
                      action_id: { transaction_id: proposal.txHash, index: 0 },
                      voting_procedure: { vote: { type: "YES" } },
                    },
                  ],
                },
              ],
            },
          }),
        ),
      );
    };

    expectAccepted(await spoVote("minfee_a", "45"));
    expectAccepted(
      await spoVote("max_block_ex_units", { mem: "1", steps: "1" }),
    );
    expect(rules(await spoVote("collateral_percentage", 150))).toContain(
      "DisallowedVoters",
    );
  });

  it("accepts a proposal following the last enacted action of its purpose", async () => {
    const enacted = "a".repeat(64);
    const { emulator } = await setup("cquisitor", {
      accounts: [{ rewardAddress: openStake }],
      governance: {
        lastEnacted: [
          {
            transactionId: enacted,
            govActionIndex: 0,
            kind: GovernanceActionKind.NoConfidenceAction,
          },
        ],
      },
    });
    const proposeAfter = (transactionId: string) =>
      emulator.simulate(
        rawTx({
          delta: GOV_DEPOSIT,
          body: {
            voting_proposals: [
              {
                anchor,
                deposit: String(GOV_DEPOSIT),
                reward_account: openStake,
                governance_action: {
                  type: "NO_CONFIDENCE_ACTION",
                  value: {
                    gov_action_id: { transaction_id: transactionId, index: 0 },
                  },
                },
              },
            ],
          },
        }),
      );

    expectAccepted(await proposeAfter(enacted));
    expect((await proposeAfter("b".repeat(64))).accepted).toBe(false);
  });

  it("forfeits only the collateral of a transaction marked invalid, when a script fails", async () => {
    const locked = (script: typeof alwaysSucceed): UTxO => ({
      input: { txHash: "9".repeat(64), outputIndex: 0 },
      output: {
        address: resolvePlutusScriptAddress(script, 1),
        amount: lovelace("20000000"),
        plutusData: "d87980",
      },
    });
    const markedInvalid = async (script: typeof alwaysSucceed) => {
      const { wallet, address, collateral, emulator, builder } = await setup(
        "cquisitor",
        { utxos: [locked(script)] },
      );
      const txHex = await builder({ evaluate: false })
        .spendingPlutusScriptV3()
        .txIn("9".repeat(64), 0)
        .txInInlineDatumPresent()
        .txInRedeemerValue(mConStr0([]), "Mesh", {
          mem: 1_000_000,
          steps: 500_000_000,
        })
        .txInScript(script.code)
        .txInCollateral(
          collateral.input.txHash,
          0,
          collateral.output.amount,
          address,
        )
        .setTotalCollateral("3000000")
        .setCollateralReturnAddress(address)
        .changeAddress(address)
        .complete();
      const tx = deserializeTx(await wallet.signTx(txHex));
      tx.setIsValid(false);
      return {
        emulator,
        collateral,
        result: await emulator.submit(tx.toCbor()),
      };
    };

    const failing = await markedInvalid(alwaysFail);
    const accepted = expectAccepted(failing.result);
    expect(accepted.isValid).toBe(false);
    expect(accepted.consumed).toEqual([failing.collateral]);
    expect(accepted.produced).toHaveLength(1);
    expect(failing.emulator.utxos({ txHash: "9".repeat(64) })).toHaveLength(1);

    const passing = await markedInvalid(alwaysSucceed);
    expect(passing.result.accepted).toBe(false);
  });

  it("registers a key-hash stake address with the payment key's signature alone", async () => {
    const { wallet, stake, emulator, builder, address, funding } =
      await setup("cquisitor");
    const txHex = await builder()
      .registerStakeCertificate(stake)
      .changeAddress(address)
      .selectUtxosFrom([funding])
      .complete();
    expectAccepted(await emulator.simulate(await wallet.signTx(txHex)));
  });

  it("checks the treasury a transaction states, when it is known", async () => {
    const stating = (value: string) =>
      rawTx({ body: { current_treasury_value: value } });
    const known = await TxEmulator.create({
      validator: "cquisitor",
      utxos: [
        {
          input: outRef(2),
          output: {
            address: openAddress,
            amount: lovelace(String(OPEN_FUNDS)),
          },
        },
      ],
      governance: { treasury: "1000000000" },
    });
    expectAccepted(await known.simulate(stating("1000000000")));
    expect((await known.simulate(stating("999"))).accepted).toBe(false);

    const unknown = await TxEmulator.create({
      validator: "cquisitor",
      utxos: [
        {
          input: outRef(2),
          output: {
            address: openAddress,
            amount: lovelace(String(OPEN_FUNDS)),
          },
        },
      ],
    });
    const taken = expectAccepted(await unknown.simulate(stating("999")));
    expect(warningRules(taken)).toContain("NotChecked");
  });

  it("checks the guardrail script proposals name, when the constitution is known", async () => {
    const guardrailed = (policyHash: string) =>
      rawTx({
        delta: GOV_DEPOSIT,
        body: {
          voting_proposals: [
            {
              anchor,
              deposit: String(GOV_DEPOSIT),
              reward_account: openStake,
              governance_action: {
                type: "PARAMETER_CHANGE_ACTION",
                value: {
                  policy_hash: policyHash,
                  protocol_param_updates: { max_tx_size: 16385 },
                },
              },
            },
          ],
        },
      });
    const withGuardrail = async (guardrailScriptHash?: string) =>
      (
        await setup("cquisitor", {
          accounts: [{ rewardAddress: openStake }],
          ...(guardrailScriptHash && {
            governance: {
              constitution: {
                anchor: {
                  anchorUrl: "https://example.com/c.json",
                  anchorDataHash: "cd".repeat(32),
                },
                guardrailScriptHash,
              },
            },
          }),
        })
      ).emulator;
    // The proposals name the open script, which the transaction carries
    const proposal = guardrailed(openHash);

    expectAccepted(await (await withGuardrail(openHash)).simulate(proposal));
    expect(
      rules(await (await withGuardrail("12".repeat(28))).simulate(proposal)),
    ).toEqual(["InvalidConstitutionPolicyHash"]);
    const taken = expectAccepted(
      await (await withGuardrail()).simulate(proposal),
    );
    expect(warningRules(taken)).toContain("NotChecked");
  });

  it("checks a native multisig unsigned, as it would pass once signed", async () => {
    const { pubKeyHash, address } = await setup("cquisitor");
    const spendFrom = async (script: NativeScript) => {
      const scriptAddress = resolveNativeScriptAddress(script, 1);
      const utxo: UTxO = {
        input: outRef(5),
        output: { address: scriptAddress, amount: lovelace("50000000") },
      };
      const emulator = await TxEmulator.create({
        validator: "cquisitor",
        utxos: [utxo],
      });
      const txHex = await new MeshTxBuilder({
        fetcher: emulator,
        params: await emulator.fetchProtocolParameters(),
      })
        .txIn(utxo.input.txHash, 0, utxo.output.amount, scriptAddress, 0)
        .txInScript(resolveNativeScriptHex(script))
        .changeAddress(address)
        .complete();
      return {
        unsigned: await emulator.simulate(txHex, { requireSignatures: false }),
        strict: await emulator.simulate(txHex),
      };
    };

    const multisig = await spendFrom({ type: "sig", keyHash: pubKeyHash });
    expectAccepted(multisig.unsigned);
    expect(multisig.strict.accepted).toBe(false);

    // A time lock not yet open fails whoever signs
    const locked = await spendFrom({
      type: "all",
      scripts: [
        { type: "sig", keyHash: pubKeyHash },
        { type: "after", slot: "999999999999" },
      ],
    });
    expect(locked.unsigned.accepted).toBe(false);
  });

  it("checks votes against governance state set without a transaction", async () => {
    const actionHash = "e".repeat(64);
    const action = { transactionId: actionHash, govActionIndex: 0 };
    const { emulator } = await setup("cquisitor");
    const voteBy = (voter: unknown) =>
      emulator.simulate(
        rawTx({
          body: {
            voting_procedures: [
              {
                voter,
                votes: [
                  {
                    action_id: { transaction_id: actionHash, index: 0 },
                    voting_procedure: { vote: { type: "YES" } },
                  },
                ],
              },
            ],
          },
        }),
      );
    const drep = { type: "DREP", value: openCredential };
    const committee = {
      type: "CONSTITUTIONAL_COMMITTEE_HOT_CRED",
      value: openCredential,
    };

    emulator.setDRep({ drepId: openDRep });
    expect(rules(await voteBy(drep))).toContain("GovActionsDoNotExist");
    emulator.setGovernanceAction({
      ...action,
      kind: GovernanceActionKind.InfoAction,
    });
    expectAccepted(await voteBy(drep));

    // A member proposed by a committee update, then elected
    const cold = { type: "KeyHash" as const, keyHash: "c0".repeat(28) };
    emulator.setCommitteeMember({
      cold,
      hot: { type: "ScriptHash", scriptHash: openHash },
      potential: true,
    });
    expect(rules(await voteBy(committee))).toContain(
      "UnelectedCommitteeVoters",
    );
    emulator.setCommitteeMember({ cold, potential: false });
    expectAccepted(await voteBy(committee));
    emulator.removeCommitteeMember(cold);
    expect((await voteBy(committee)).accepted).toBe(false);

    emulator.setGovernanceAction({
      ...action,
      kind: GovernanceActionKind.InfoAction,
      active: false,
    });
    expect((await voteBy(drep)).accepted).toBe(false);
    emulator.removeGovernanceAction(action);
    expect(rules(await voteBy(drep))).toContain("GovActionsDoNotExist");
  });

  it("checks the treasury, the last enacted actions and the constitution set without a transaction", async () => {
    const { emulator } = await setup("cquisitor", {
      accounts: [{ rewardAddress: openStake }],
    });
    const propose = (action: Record<string, unknown>) =>
      emulator.simulate(
        rawTx({
          delta: GOV_DEPOSIT,
          body: {
            voting_proposals: [
              {
                anchor,
                deposit: String(GOV_DEPOSIT),
                reward_account: openStake,
                governance_action: action,
              },
            ],
          },
        }),
      );

    const stating = rawTx({ body: { current_treasury_value: "1000000000" } });
    emulator.setTreasury("999");
    expect((await emulator.simulate(stating)).accepted).toBe(false);
    emulator.setTreasury("1000000000");
    expect(
      warningRules(expectAccepted(await emulator.simulate(stating))),
    ).not.toContain("NotChecked");

    // A no-confidence motion follows the last enacted action of the committee's purpose
    emulator.setLastEnacted({
      transactionId: "a".repeat(64),
      govActionIndex: 0,
      kind: GovernanceActionKind.UpdateCommitteeAction,
    });
    const noConfidenceAfter = (transactionId: string) =>
      propose({
        type: "NO_CONFIDENCE_ACTION",
        value: { gov_action_id: { transaction_id: transactionId, index: 0 } },
      });
    expectAccepted(await noConfidenceAfter("a".repeat(64)));
    expect((await noConfidenceAfter("b".repeat(64))).accepted).toBe(false);

    // The proposal names the open script, which the transaction carries
    const guardrailed = () =>
      propose({
        type: "PARAMETER_CHANGE_ACTION",
        value: {
          policy_hash: openHash,
          protocol_param_updates: { max_tx_size: 16385 },
        },
      });
    const constitution = (guardrailScriptHash: string) => ({
      anchor: {
        anchorUrl: "https://example.com/c.json",
        anchorDataHash: "cd".repeat(32),
      },
      guardrailScriptHash,
    });
    emulator.setConstitution(constitution("12".repeat(28)));
    expect(rules(await guardrailed())).toEqual([
      "InvalidConstitutionPolicyHash",
    ]);
    emulator.setConstitution(constitution(openHash));
    expectAccepted(await guardrailed());
  });

  it("lets a member proposed for the committee act only while a committee update proposes it", async () => {
    const { emulator } = await setup("cquisitor", {
      accounts: [{ rewardAddress: openStake }],
    });
    // Committee updates adding the open script's cold credential
    const propose = () =>
      emulator.submit(
        rawTx({
          ...nextOpen(emulator),
          delta: GOV_DEPOSIT,
          body: {
            voting_proposals: [
              {
                anchor,
                deposit: String(GOV_DEPOSIT),
                reward_account: openStake,
                governance_action: {
                  type: "UPDATE_COMMITTEE_ACTION",
                  value: {
                    committee: {
                      members: [
                        {
                          stake_credential: openCredential,
                          term_limit: BigInt(emulator.epoch + 50),
                        },
                      ],
                      quorum_threshold: { numerator: "1", denominator: "2" },
                    },
                    members_to_remove: [],
                  },
                },
              },
            ],
          },
        }),
      );
    const authorise = () =>
      emulator.simulate(
        rawTx({
          ...nextOpen(emulator),
          body: {
            certs: [
              {
                type: "COMMITTEE_HOT_AUTH",
                value: {
                  committee_cold_credential: openCredential,
                  committee_hot_credential: {
                    type: "KEY",
                    value: "12".repeat(28),
                  },
                },
              },
            ],
          },
        }),
      );
    const proposed = async () =>
      (await emulator.fetchCommitteeState()).some(
        ({ cold, potential }) =>
          potential &&
          cold.type === "ScriptHash" &&
          cold.scriptHash === openHash,
      );

    const first = expectAccepted(await propose());
    expect(await proposed()).toBe(true);
    expectAccepted(await authorise());
    emulator.advanceTo({ epoch: emulator.epoch + 3 });
    const second = expectAccepted(await propose());

    // The first update expires and goes, the second still proposes the member
    const { expiration } = await emulator.fetchGovernanceProposal(
      first.txHash,
      0,
    );
    emulator.advanceTo({ epoch: expiration + 1 });
    await expect(
      emulator.fetchGovernanceProposal(first.txHash, 0),
    ).rejects.toThrow("not in the ledger");
    expect(await proposed()).toBe(true);
    expectAccepted(await authorise());

    // With no update proposing it any more, the ledger does not know the member
    emulator.removeGovernanceAction({
      transactionId: second.txHash,
      govActionIndex: 0,
    });
    expect(await proposed()).toBe(false);
    expect(rules(await authorise())).toContain("CommitteeIsUnknown");
  });

  it("checks the fee and size of an unsigned transaction as they will be once signed", async () => {
    const { wallet, address, funding, pubKeyHash, emulator } =
      await setup("cquisitor");
    const { minFeeA, minFeeB } = await emulator.fetchProtocolParameters();
    // A payment built by hand, its fee worked out from its size
    const payment = (fee: bigint) =>
      transactionPrototypeToHex({
        body: {
          inputs: [{ transaction_id: funding.input.txHash, index: 0 }],
          outputs: [
            { address, amount: { coin: String(10_000_000_000n - fee) } },
          ],
          fee: String(fee),
        },
        is_valid: true,
        witness_set: {},
      } as unknown as TransactionPrototype);
    const feeFor = (txHex: string) =>
      BigInt(minFeeA) * BigInt(txHex.length / 2) + BigInt(minFeeB);

    // Enough for the bytes it has, not for the signature it is still to get
    const unsignedFee = payment(feeFor(payment(200_000n)));
    expect(
      rules(await emulator.simulate(unsignedFee, { requireSignatures: false })),
    ).toEqual(["FeeTooSmallUTxO"]);
    expect(
      rules(await emulator.simulate(await wallet.signTx(unsignedFee))),
    ).toEqual(["FeeTooSmallUTxO"]);
    const signedFee = payment(feeFor(await wallet.signTx(unsignedFee)));
    expectAccepted(
      await emulator.simulate(signedFee, { requireSignatures: false }),
    );
    expectAccepted(await emulator.simulate(await wallet.signTx(signedFee)));
    expectAccepted(
      await emulator.simulate(await wallet.signTx(signedFee), {
        requireSignatures: false,
      }),
    );

    // The key a native script needs counts as a signature still to come
    const script: NativeScript = { type: "sig", keyHash: pubKeyHash };
    const locked: UTxO = {
      input: outRef(5),
      output: {
        address: resolveNativeScriptAddress(script, 1),
        amount: lovelace("50000000"),
      },
    };
    const scripted = await TxEmulator.create({
      validator: "cquisitor",
      utxos: [locked],
    });
    const spend = (fee: bigint) =>
      transactionPrototypeToHex({
        body: {
          inputs: [{ transaction_id: locked.input.txHash, index: 0 }],
          outputs: [{ address, amount: { coin: String(50_000_000n - fee) } }],
          fee: String(fee),
        },
        is_valid: true,
        witness_set: {
          native_scripts: [
            { type: "SCRIPT_PUBKEY", value: { addr_keyhash: pubKeyHash } },
          ],
        },
      } as unknown as TransactionPrototype);
    const scriptFee = spend(feeFor(spend(200_000n)));
    expect(
      rules(await scripted.simulate(scriptFee, { requireSignatures: false })),
    ).toEqual(["FeeTooSmallUTxO"]);
    expectAccepted(
      await scripted.simulate(
        spend(feeFor(await wallet.signTx(scriptFee, true))),
        { requireSignatures: false },
      ),
    );

    // Within the size limit only unsigned
    const strict = await TxEmulator.create({
      validator: "cquisitor",
      utxos: [funding],
      params: { maxTxSize: signedFee.length / 2 },
    });
    const tooBig = await strict.simulate(signedFee, {
      requireSignatures: false,
    });
    expect(rules(tooBig)).toEqual(["MaxTxSizeUTxO"]);
    expect(!tooBig.accepted && tooBig.errors[0]!.message).toContain(
      "once signed",
    );
  });

  it("reports a governance action closed to votes as expired, to a ledger read from it too", async () => {
    const { emulator } = await setup("cquisitor", {
      accounts: [{ rewardAddress: openStake }],
      dreps: [{ drepId: openDRep }],
    });
    const voteOn = (txHash: string) =>
      rawTx({
        ...nextOpen(emulator),
        body: {
          voting_procedures: [
            {
              voter: { type: "DREP", value: openCredential },
              votes: [
                {
                  action_id: { transaction_id: txHash, index: 0 },
                  voting_procedure: { vote: { type: "YES" } },
                },
              ],
            },
          ],
        },
      });
    const proposal = expectAccepted(
      await emulator.submit(
        rawTx({
          delta: GOV_DEPOSIT,
          body: {
            voting_proposals: [
              {
                anchor,
                deposit: String(GOV_DEPOSIT),
                reward_account: openStake,
                governance_action: { type: "INFO_ACTION" },
              },
            ],
          },
        }),
      ),
    );
    emulator.setGovernanceAction({
      transactionId: proposal.txHash,
      govActionIndex: 0,
      kind: GovernanceActionKind.InfoAction,
      active: false,
    });
    const vote = voteOn(proposal.txHash);
    expect(rules(await emulator.simulate(vote))).toEqual([
      "VotingOnExpiredGovAction",
    ]);
    expect(
      (await emulator.fetchGovernanceProposal(proposal.txHash, 0)).expiredEpoch,
    ).toBe(emulator.epoch);

    const copy = await TxEmulator.fromChain(vote, {
      validator: "cquisitor",
      fetcher: emulator,
    });
    const result = await copy.simulate(vote);
    expect(rules(result)).toEqual(["VotingOnExpiredGovAction"]);
    expect(warningRules(result)).not.toContain("NotChecked");

    // One closed with no lifetime stays in the copy as long as here
    const closed = "e".repeat(64);
    emulator.setGovernanceAction({
      transactionId: closed,
      govActionIndex: 0,
      kind: GovernanceActionKind.InfoAction,
      active: false,
    });
    const late = voteOn(closed);
    const lateCopy = await TxEmulator.fromChain(late, {
      validator: "cquisitor",
      fetcher: emulator,
    });
    lateCopy.advanceTo({ epoch: lateCopy.epoch + 2 });
    expect(rules(await lateCopy.simulate(late))).toEqual([
      "VotingOnExpiredGovAction",
    ]);
  });

  it("takes a parameter change whose parameters are not given as one stake pools vote on, and says so", async () => {
    const operator = await walletKeyHash;
    const actionHash = "e".repeat(64);
    const action = {
      transactionId: actionHash,
      govActionIndex: 0,
      kind: GovernanceActionKind.ParameterChangeAction,
    };
    const { emulator, pubKeyHash, sign } = await setup("cquisitor", {
      pools: [{ poolId: operator }],
      governance: { actions: [action] },
    });
    const vote = await sign(
      rawTx({
        body: {
          voting_procedures: [
            {
              voter: { type: "STAKING_POOL", value: pubKeyHash },
              votes: [
                {
                  action_id: { transaction_id: actionHash, index: 0 },
                  voting_procedure: { vote: { type: "YES" } },
                },
              ],
            },
          ],
        },
      }),
    );
    const unknownParameters = expect.objectContaining({
      rule: "NotChecked",
      message: expect.stringContaining("Which parameters"),
    });

    expect(
      expectAccepted(await emulator.simulate(vote)).warnings,
    ).toContainEqual(unknownParameters);
    const copy = await TxEmulator.fromChain(vote, {
      validator: "cquisitor",
      fetcher: emulator,
    });
    expect(expectAccepted(await copy.simulate(vote)).warnings).toContainEqual(
      unknownParameters,
    );

    // Once they are given, they are checked
    emulator.setGovernanceAction({
      ...action,
      changedParameters: ["collateralPercentage"],
    });
    expect(rules(await emulator.simulate(vote))).toContain("DisallowedVoters");
  });
});

describe.each(["scalus", "cquisitor"] as const)(
  "TxEmulator.fromChain (%s)",
  (validator) => {
    /** A provider that is only an `IFetcher`, reading another emulator */
    const plainFetcher = (chain: TxEmulator): IFetcher => {
      const hidden = new Set([
        "fetchDRepState",
        "fetchCommitteeState",
        "fetchLastEnactedGovernanceActions",
        "fetchTreasury",
        "fetchConstitution",
        "fetchPoolState",
      ]);
      return new Proxy(chain, {
        get: (target, property) => {
          if (hidden.has(String(property))) return undefined;
          if (property === "fetchAccountInfo")
            // Without the DRep delegation, which a plain provider may not report
            return async (address: string) => {
              const { drep, ...info } = await target.fetchAccountInfo(address);
              void drep;
              return info;
            };
          const value = (target as any)[property];
          return typeof value === "function" ? value.bind(target) : value;
        },
      }) as unknown as IFetcher;
    };

    it("checks a transaction against the state a full provider reports", async () => {
      const { emulator: chain, next } = await setup(validator, {
        accounts: [{ rewardAddress: openStake, rewards: "7000000" }],
        pools: [{ poolId: poolHash }],
      });
      const tx = await next()
        .withdrawal(openStake, "7000000")
        .withdrawalScript(openScriptHex)
        .delegateStakeCertificate(openStake, poolHash)
        .certificateScript(openScriptHex)
        .complete();

      const emulator = await TxEmulator.fromChain(tx, {
        validator,
        fetcher: chain,
      });

      expect((await emulator.fetchAccountInfo(openStake)).rewards).toBe(
        "7000000",
      );
      const result = expectAccepted(await emulator.simulate(tx));
      expect(warningRules(result)).not.toContain("NotChecked");
    });

    it("takes what a plain IFetcher cannot report as the transaction needs it, and says so", async () => {
      const { emulator: chain, next } = await setup(validator, {
        accounts: [{ rewardAddress: openStake }],
        pools: [{ poolId: poolHash }],
      });
      const delegation = await next()
        .delegateStakeCertificate(openStake, poolHash)
        .certificateScript(openScriptHex)
        .complete();

      const emulator = await TxEmulator.fromChain(delegation, {
        validator,
        fetcher: plainFetcher(chain),
      });

      const result = expectAccepted(await emulator.simulate(delegation));
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          rule: "NotChecked",
          message: expect.stringContaining(poolId),
        }),
      );
      await expect(emulator.fetchPoolState(poolHash)).rejects.toThrow(
        "not known",
      );
    });

    it("leaves DRep delegations a provider does not report unchecked", async () => {
      const {
        emulator: base,
        stake,
        sign,
        address,
        funding,
        builder,
      } = await setup(validator);
      const chain = await TxEmulator.create({
        validator,
        utxos: base.utxos(),
        accounts: [
          { rewardAddress: stake, rewards: "7000000", drep: "alwaysAbstain" },
        ],
      });
      const withdrawal = await sign(
        await builder()
          .withdrawal(stake, "7000000")
          .changeAddress(address)
          .selectUtxosFrom([funding])
          .complete(),
      );

      const emulator = await TxEmulator.fromChain(withdrawal, {
        validator,
        fetcher: plainFetcher(chain),
      });

      const result = expectAccepted(await emulator.simulate(withdrawal));
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          rule: "NotChecked",
          message: expect.stringContaining("DRep delegation"),
        }),
      );
    });

    it("reads governance state from a separate provider", async () => {
      const { emulator: chain, next } = await setup(validator, {
        accounts: [{ rewardAddress: openStake }],
        dreps: [{ drepId: openDRep }],
      });
      const delegation = await next()
        .voteDelegationCertificate({ dRepId: openDRep }, openStake)
        .certificateScript(openScriptHex)
        .complete();

      const blind = await TxEmulator.fromChain(delegation, {
        validator,
        fetcher: plainFetcher(chain),
      });
      expect(
        expectAccepted(await blind.simulate(delegation)).warnings,
      ).toContainEqual(
        expect.objectContaining({
          rule: "NotChecked",
          message: expect.stringContaining(openDRep),
        }),
      );

      const informed = await TxEmulator.fromChain(delegation, {
        validator,
        fetcher: plainFetcher(chain),
        governance: chain,
      });
      expect(
        warningRules(expectAccepted(await informed.simulate(delegation))),
      ).not.toContain("NotChecked");
      expect((await informed.fetchDRepState(openDRep)).registered).toBe(true);
    });

    it("checks state set after reading the chain", async () => {
      const { emulator: chain, next } = await setup(validator, {
        accounts: [{ rewardAddress: openStake }],
        pools: [{ poolId: poolHash }],
      });
      const delegation = await next()
        .delegateStakeCertificate(openStake, poolHash)
        .certificateScript(openScriptHex)
        .complete();
      const emulator = await TxEmulator.fromChain(delegation, {
        validator,
        fetcher: plainFetcher(chain),
      });

      emulator.setPool({ poolId: poolHash });
      expect(
        warningRules(expectAccepted(await emulator.simulate(delegation))),
      ).not.toContain("NotChecked");
      if (validator === "cquisitor") {
        emulator.removePool(poolHash);
        expect(rules(await emulator.simulate(delegation))).toContain(
          "StakePoolNotRegistered",
        );
      }
    });

    it("throws when the outputs or parameters cannot be read", async () => {
      const { emulator: chain, next } = await setup(validator);
      const tx = await next().complete();
      const failing = new Proxy(chain, {
        get: (target, property) =>
          property === "fetchUTxOs"
            ? async () => {
                throw new Error("provider down");
              }
            : ((target as any)[property]?.bind?.(target) ??
              (target as any)[property]),
      }) as unknown as IFetcher;

      await expect(
        TxEmulator.fromChain(tx, { validator, fetcher: failing }),
      ).rejects.toThrow("provider down");
    });

    /** A provider answering as another one does, but for the methods given */
    const view = (
      provider: IFetcher,
      methods: Record<string, unknown>,
    ): IFetcher =>
      new Proxy(provider, {
        get: (target, property) => {
          if (String(property) in methods) return methods[String(property)];
          const value = (target as any)[property];
          return typeof value === "function" ? value.bind(target) : value;
        },
      });

    const notChecked = (subject: string) =>
      expect.objectContaining({
        rule: "NotChecked",
        message: expect.stringContaining(subject),
      });

    it("takes a proposal to follow the enacted action it names, when the last enacted ones are not known", async () => {
      const enacted = "a".repeat(64);
      const { emulator: chain } = await setup(validator, {
        accounts: [{ rewardAddress: openStake }],
      });
      const motion = rawTx({
        delta: GOV_DEPOSIT,
        body: {
          voting_proposals: [
            {
              anchor,
              deposit: String(GOV_DEPOSIT),
              reward_account: openStake,
              governance_action: {
                type: "NO_CONFIDENCE_ACTION",
                value: { gov_action_id: { transaction_id: enacted, index: 0 } },
              },
            },
          ],
        },
      });
      // The provider reports the action enacted, as indexers do, not the last enacted ones
      const fetcher = view(plainFetcher(chain), {
        fetchGovernanceProposal: async (txHash: string, certIndex: number) => ({
          txHash,
          certIndex,
          governanceType: "no_confidence",
          deposit: Number(GOV_DEPOSIT),
          returnAddress: openStake,
          governanceDescription: { tag: "NoConfidence" },
          ratifiedEpoch: 500,
          enactedEpoch: 501,
          droppedEpoch: null,
          expiredEpoch: null,
          expiration: 506,
          metadata: {},
        }),
      });

      const emulator = await TxEmulator.fromChain(motion, {
        validator,
        fetcher,
      });
      expect(
        expectAccepted(await emulator.simulate(motion)).warnings,
      ).toContainEqual(notChecked("last enacted committee action"));
    });

    it("takes a pool registration it cannot read as new or as an update, as the transaction pays", async () => {
      const operator = await walletKeyHash;
      const {
        emulator: chain,
        pubKeyHash,
        sign,
      } = await setup(validator, {
        accounts: [{ rewardAddress: openStake }],
        pools: [{ poolId: operator }],
      });
      const registration = (deposit: bigint) =>
        sign(
          rawTx({
            delta: deposit,
            body: {
              certs: [
                {
                  type: "POOL_REGISTRATION",
                  value: {
                    pool_params: {
                      operator: pubKeyHash,
                      vrf_keyhash: "11".repeat(32),
                      pledge: "0",
                      cost: "400000000",
                      margin: { numerator: "1", denominator: "100" },
                      reward_account: openStake,
                      pool_owners: [pubKeyHash],
                      relays: [],
                      pool_metadata: null,
                    },
                  },
                },
              ],
            },
          }),
        );
      const check = async (txHex: string) =>
        (
          await TxEmulator.fromChain(txHex, {
            validator,
            fetcher: plainFetcher(chain),
          })
        ).simulate(txHex);

      // An update of the pool, paying no deposit
      const update = await check(await registration(0n));
      expect(update.warnings).toContainEqual(
        notChecked(Cardano.PoolId.fromKeyHash(operator as never).toString()),
      );
      // Scalus charges a re-registration another deposit (see the README)
      if (validator === "cquisitor") expectAccepted(update);
      else expect(update.accepted).toBe(false);
      // A registration paying the deposit, taken to be of a new pool
      expectAccepted(await check(await registration(500_000_000n)));
    });

    it("knows the governance actions proposed on it", async () => {
      const operator = await walletKeyHash;
      const {
        emulator: chain,
        pubKeyHash,
        sign,
      } = await setup(validator, {
        accounts: [{ rewardAddress: openStake }],
      });
      const treasuryWithdrawal = rawTx({
        delta: GOV_DEPOSIT,
        body: {
          voting_proposals: [
            {
              anchor,
              deposit: String(GOV_DEPOSIT),
              reward_account: openStake,
              governance_action: {
                type: "TREASURY_WITHDRAWALS_ACTION",
                value: { withdrawals: { [openStake]: "1000000" } },
              },
            },
          ],
        },
      });
      const emulator = await TxEmulator.fromChain(treasuryWithdrawal, {
        validator,
        fetcher: chain,
      });
      const proposal = expectAccepted(
        await emulator.submit(treasuryWithdrawal),
      );
      expect(
        await emulator.fetchGovernanceProposal(proposal.txHash, 0),
      ).toMatchObject({
        governanceType: GovernanceActionKind.TreasuryWithdrawalsAction,
      });

      // Stake pools do not vote on treasury withdrawals
      emulator.setPool({ poolId: operator });
      const vote = await emulator.simulate(
        await sign(
          rawTx({
            ...nextOpen(emulator),
            body: {
              voting_procedures: [
                {
                  voter: { type: "STAKING_POOL", value: pubKeyHash },
                  votes: [
                    {
                      action_id: { transaction_id: proposal.txHash, index: 0 },
                      voting_procedure: { vote: { type: "YES" } },
                    },
                  ],
                },
              ],
            },
          }),
        ),
      );
      expect(warningRules(vote)).not.toContain("NotChecked");
      if (validator === "cquisitor")
        expect(rules(vote)).toContain("DisallowedVoters");
    });

    it("reads an epoch a provider gives as 0 as not set", async () => {
      const live = "e".repeat(64);
      const pending = "f".repeat(64);
      const { emulator: chain } = await setup(validator, {
        accounts: [{ rewardAddress: openStake }],
        dreps: [{ drepId: openDRep }],
      });
      // Some providers write 0 for every epoch of an action, however far it got
      const fetcher = view(chain, {
        fetchGovernanceProposal: async (txHash: string, certIndex: number) => ({
          txHash,
          certIndex,
          governanceType:
            txHash === live ? "INFO_ACTION" : "PARAMETER_CHANGE_ACTION",
          deposit: Number(GOV_DEPOSIT),
          returnAddress: openStake,
          governanceDescription: "https://example.com/a.json",
          ratifiedEpoch: 0,
          enactedEpoch: 0,
          droppedEpoch: 0,
          expiredEpoch: 0,
          expiration: 0,
          metadata: {},
        }),
      });
      const vote = rawTx({
        body: {
          voting_procedures: [
            {
              voter: { type: "DREP", value: openCredential },
              votes: [
                {
                  action_id: { transaction_id: live, index: 0 },
                  voting_procedure: { vote: { type: "YES" } },
                },
              ],
            },
          ],
        },
      });
      const following = rawTx({
        delta: GOV_DEPOSIT,
        body: {
          voting_proposals: [
            {
              anchor,
              deposit: String(GOV_DEPOSIT),
              reward_account: openStake,
              governance_action: {
                type: "PARAMETER_CHANGE_ACTION",
                value: {
                  gov_action_id: { transaction_id: pending, index: 0 },
                  protocol_param_updates: { max_tx_size: 16385 },
                },
              },
            },
          ],
        },
      });

      for (const tx of [vote, following])
        expectAccepted(
          await (
            await TxEmulator.fromChain(tx, { validator, fetcher })
          ).simulate(tx),
        );
    });

    it("knows only the committee member or the purpose set after reading the chain", async () => {
      const action = "e".repeat(64);
      const keyHash = (byte: string) => ({
        type: "KeyHash" as const,
        keyHash: byte.repeat(28),
      });
      const { emulator: chain } = await setup(validator, {
        accounts: [{ rewardAddress: openStake }],
        governance: {
          actions: [
            {
              transactionId: action,
              govActionIndex: 0,
              kind: GovernanceActionKind.InfoAction,
            },
          ],
          committee: [
            { cold: keyHash("c1"), hot: keyHash("a1"), resigned: false },
            {
              cold: keyHash("c2"),
              hot: { type: "ScriptHash", scriptHash: openHash },
              resigned: false,
            },
          ],
          lastEnacted: [
            {
              transactionId: "a".repeat(64),
              govActionIndex: 0,
              kind: GovernanceActionKind.NoConfidenceAction,
            },
            {
              transactionId: "b".repeat(64),
              govActionIndex: 0,
              kind: GovernanceActionKind.ParameterChangeAction,
            },
          ],
        },
      });

      // The second member votes; the first is set, the second stays unknown
      const vote = rawTx({
        body: {
          voting_procedures: [
            {
              voter: {
                type: "CONSTITUTIONAL_COMMITTEE_HOT_CRED",
                value: openCredential,
              },
              votes: [
                {
                  action_id: { transaction_id: action, index: 0 },
                  voting_procedure: { vote: { type: "YES" } },
                },
              ],
            },
          ],
        },
      });
      const voting = await TxEmulator.fromChain(vote, {
        validator,
        fetcher: plainFetcher(chain),
      });
      voting.setCommitteeMember({ cold: keyHash("c1"), hot: keyHash("a1") });
      expect(
        expectAccepted(await voting.simulate(vote)).warnings,
      ).toContainEqual(notChecked("committee member voting"));
      await expect(voting.fetchCommitteeState()).rejects.toThrow("not known");

      // A no-confidence motion naming no action, though one of its purpose was enacted; the
      // last enacted parameter change is set, that of the committee stays unknown
      const motion = rawTx({
        delta: GOV_DEPOSIT,
        body: {
          voting_proposals: [
            {
              anchor,
              deposit: String(GOV_DEPOSIT),
              reward_account: openStake,
              governance_action: { type: "NO_CONFIDENCE_ACTION", value: {} },
            },
          ],
        },
      });
      const proposing = await TxEmulator.fromChain(motion, {
        validator,
        fetcher: plainFetcher(chain),
      });
      proposing.setLastEnacted({
        transactionId: "b".repeat(64),
        govActionIndex: 0,
        kind: GovernanceActionKind.ParameterChangeAction,
      });
      expect(
        expectAccepted(await proposing.simulate(motion)).warnings,
      ).toContainEqual(notChecked("last enacted committee action"));
    });

    it("takes the state each transaction needs that it does not know, not only the first", async () => {
      const { emulator: base, stake, sign } = await setup(validator);
      const chain = await TxEmulator.create({
        validator,
        utxos: base.utxos(),
        accounts: [
          { rewardAddress: openStake },
          { rewardAddress: stake, rewards: "7000000", drep: "alwaysAbstain" },
        ],
        pools: [{ poolId: poolHash }],
        dreps: [{ drepId: openDRep, deposit: "400000000" }],
      });
      // Read for a payment, which touches no stake address, pool or DRep
      const emulator = await TxEmulator.fromChain(rawTx({}), {
        validator,
        fetcher: chain,
      });
      const withdrawal = await sign(
        rawTx({
          delta: -7_000_000n,
          body: { withdrawals: { [stake]: "7000000" } },
        }),
      );
      const delegation = rawTx({
        body: {
          certs: [
            {
              type: "STAKE_DELEGATION",
              value: {
                stake_credential: openCredential,
                pool_keyhash: poolHash,
              },
            },
          ],
        },
      });
      // Reclaiming a deposit other than the current one
      const leaving = rawTx({
        delta: -400_000_000n,
        body: {
          certs: [
            {
              type: "DREP_DEREGISTRATION",
              value: { voting_credential: openCredential, coin: "400000000" },
            },
          ],
        },
      });

      for (const tx of [withdrawal, delegation, leaving])
        expect(
          warningRules(expectAccepted(await emulator.simulate(tx))),
        ).toContain("NotChecked");
    });

    it("tells a DRep delegation it does not know from none, as a provider for another ledger", async () => {
      const {
        emulator: base,
        stake,
        sign,
        address,
        funding,
        builder,
      } = await setup(validator);
      const withAccount = (drep?: string) =>
        TxEmulator.create({
          validator,
          utxos: base.utxos(),
          accounts: [{ rewardAddress: stake, rewards: "7000000", drep }],
        });
      const withdrawal = await sign(
        await builder()
          .withdrawal(stake, "7000000")
          .changeAddress(address)
          .selectUtxosFrom([funding])
          .complete(),
      );

      // Read through a provider that does not report delegations, the delegation is not known,
      // and stays so for a ledger read from that one
      const first = await TxEmulator.fromChain(withdrawal, {
        validator,
        fetcher: plainFetcher(await withAccount("alwaysAbstain")),
      });
      expect((await first.fetchAccountInfo(stake)).drep).toBeUndefined();
      const second = await TxEmulator.fromChain(withdrawal, {
        validator,
        fetcher: first,
      });
      expect(
        expectAccepted(await second.simulate(withdrawal)).warnings,
      ).toContainEqual(notChecked("DRep delegation"));

      // One known to be none is reported, and checked
      const undelegated = await withAccount();
      expect((await undelegated.fetchAccountInfo(stake)).drep).toBeNull();
      const result = await (
        await TxEmulator.fromChain(withdrawal, {
          validator,
          fetcher: undelegated,
        })
      ).simulate(withdrawal);
      expect(warningRules(result)).not.toContain("NotChecked");
      // Scalus does not check DRep delegations (see the README)
      if (validator === "cquisitor")
        expect(rules(result)).toContain(
          "WithdrawalNotAllowedBecauseNotDelegatedToDRep",
        );
    });

    it("pays a retiring pool's deposit back to the stake address the provider reports for it", async () => {
      const { emulator: chain, next } = await setup(validator, {
        accounts: [{ rewardAddress: openStake }],
      });
      const retirementEpoch = chain.epoch + 1;
      chain.setPool({
        poolId: poolHash,
        rewardAddress: openStake,
        retirementEpoch,
      });
      expect((await chain.fetchPoolState(poolHash)).rewardAddress).toBe(
        openStake,
      );
      // A transaction reading the pool and its stake address
      const delegation = await next()
        .delegateStakeCertificate(openStake, poolHash)
        .certificateScript(openScriptHex)
        .complete();
      const emulator = await TxEmulator.fromChain(delegation, {
        validator,
        fetcher: chain,
      });

      expectAccepted(await emulator.submit(delegation));
      emulator.advanceTo({ epoch: retirementEpoch });
      expect((await emulator.fetchAccountInfo(openStake)).rewards).toBe(
        "500000000",
      );
      expectAccepted(
        await emulator.simulate(
          rawTx({
            ...nextOpen(emulator),
            delta: -500_000_000n,
            body: { withdrawals: { [openStake]: "500000000" } },
          }),
        ),
      );
    });

    it("takes a stake address or DRep a transaction deregisters, then registers again, as registered before", async () => {
      const { emulator: chain, next } = await setup(validator, {
        accounts: [{ rewardAddress: openStake }],
        dreps: [{ drepId: openDRep }],
      });
      // A provider that cannot read stake addresses or DReps
      const blind = view(chain, {
        fetchAccountInfo: async () => {
          throw new Error("not available");
        },
        fetchDRepState: async () => {
          throw new Error("not available");
        },
      });
      const account = await next()
        .deregisterStakeCertificate(openStake)
        .certificateScript(openScriptHex)
        .registerStakeCertificate(openStake)
        .complete();
      const drep = await next()
        .drepDeregistrationCertificate(openDRep, "500000000")
        .certificateScript(openScriptHex)
        .drepRegistrationCertificate(openDRep, undefined, "500000000")
        .certificateScript(openScriptHex)
        .complete();

      for (const tx of [account, drep]) {
        expectAccepted(await chain.simulate(tx));
        const emulator = await TxEmulator.fromChain(tx, {
          validator,
          fetcher: blind,
        });
        expect(
          warningRules(expectAccepted(await emulator.simulate(tx))),
        ).toContain("NotChecked");
      }
    });

    it("takes a deposit the provider does not report as the transaction reclaims it, and says so", async () => {
      // Registered when the deposit was 5 ADA
      const { emulator: chain } = await setup(validator, {
        accounts: [{ rewardAddress: openStake, deposit: "5000000" }],
      });
      const unreported = view(chain, {
        fetchAccountInfo: async (address: string) => {
          const { deposit, ...info } = await chain.fetchAccountInfo(address);
          void deposit;
          return info;
        },
      });
      const leaving = rawTx({
        delta: -5_000_000n,
        body: {
          certs: [
            {
              type: "STAKE_DEREGISTRATION",
              value: { stake_credential: openCredential },
            },
          ],
        },
      });

      const result = await (
        await TxEmulator.fromChain(leaving, { validator, fetcher: unreported })
      ).simulate(leaving);
      expect(result.warnings).toContainEqual(
        notChecked(`The deposit of ${openStake}`),
      );
      // Scalus takes the deposit to be the current one (see the README)
      if (validator === "cquisitor") expectAccepted(result);
    });

    it("takes what a provider reports in a form it cannot read as not known", async () => {
      const { emulator: chain, next } = await setup(validator, {
        accounts: [{ rewardAddress: openStake, drep: "alwaysAbstain" }],
        dreps: [{ drepId: openDRep }],
      });
      const delegation = await next()
        .voteDelegationCertificate({ dRepId: openDRep }, openStake)
        .certificateScript(openScriptHex)
        .complete();
      // A DRep spelt as an indexer's own API spells it
      const odd = view(chain, {
        fetchAccountInfo: async (address: string) => ({
          ...(await chain.fetchAccountInfo(address)),
          drep: "drep_always_abstain",
        }),
      });

      const emulator = await TxEmulator.fromChain(delegation, {
        validator,
        fetcher: odd,
      });
      expect(
        expectAccepted(await emulator.simulate(delegation)).warnings,
      ).toContainEqual(notChecked("could not be read"));
    });
  },
);
