import {
  applyCborEncoding,
  GovernanceActionKind,
  IFetcher,
  IFetcherExtended,
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
  getTransactionOutputs,
  scriptHashToRewardAddress,
  transactionPrototypeFromHex,
} from "@meshsdk/core-cst";
import { MeshWallet } from "@meshsdk/wallet";

import { TxEmulator, TxEmulatorOptions, TxValidator } from "../src";

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

// A native script with no conditions: it needs no signature, so transactions it witnesses are
// valid unsigned and chains of them can be built and played without keys
const openScript: NativeScript = { type: "all", scripts: [] };
const openScriptHex = resolveNativeScriptHex(openScript);
const openHash = resolveNativeScriptHash(openScript);
const openAddress = resolveNativeScriptAddress(openScript, 1);
const openStake = scriptHashToRewardAddress(openHash, 1);
const openDRep = Cardano.DRepID.cip129FromCredential({
  type: Cardano.CredentialType.ScriptHash,
  hash: openHash as never,
}).toString();
const poolHash = "ab".repeat(28);

async function setup(
  validator: TxValidator,
  options: Partial<TxEmulatorOptions> = {},
) {
  const wallet = new MeshWallet({
    networkId: 1,
    key: { type: "mnemonic", words: Array(24).fill("solution") },
  });
  await wallet.init();
  const address = (await wallet.getChangeAddress())!;
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
    output: { address: openAddress, amount: lovelace("300000000000") },
  };
  const emulator = await TxEmulator.create({
    validator,
    ...options,
    utxos: [funding, collateral, open, ...(options.utxos ?? [])],
  });
  const params = await emulator.provider.fetchProtocolParameters();
  const builder = ({ evaluate = true } = {}) =>
    new MeshTxBuilder({
      fetcher: emulator.provider,
      ...(evaluate && { evaluator: emulator.provider }),
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
  return {
    wallet,
    address,
    funding,
    collateral,
    open,
    emulator,
    builder,
    send,
    fromOpen,
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
      expect(emulator.emulator.getCardanoInfo().network).toBe("mainnet");
      const preview = await TxEmulator.create({
        validator,
        network: "preview",
      });
      expect(preview.emulator.getCardanoInfo().network).toBe("testnet");
    });

    it("simulates a transaction without changing the ledger", async () => {
      const { wallet, address, funding, emulator, send } =
        await setup(validator);
      const result = await emulator.simulate(await wallet.signTx(await send()));

      expect(result.accepted).toBe(true);
      if (!result.accepted) return;
      expect(result.fee).toBeGreaterThan(0n);
      expect(result.consumed).toEqual([funding]);
      expect(result.produced).toHaveLength(2);
      expect(
        result.produced.every((u) => u.input.txHash === result.txHash),
      ).toBe(true);
      expect(emulator.utxos({ address })).toHaveLength(2);
    });

    it("applies an accepted transaction on submit", async () => {
      const { wallet, address, emulator, send } = await setup(validator);
      const signed = await wallet.signTx(await send());

      const result = await emulator.submit(signed);

      expect(result.accepted).toBe(true);
      expect(emulator.utxos({ txHash: result.txHash! })).toHaveLength(2);
      expect(emulator.utxos({ address })).toHaveLength(3);
      expect(await emulator.simulate(signed)).toMatchObject({
        accepted: false,
        rule: "UtxoNotAvailable",
      });
    });

    it("reports missing signatures, and junk", async () => {
      const { emulator, send } = await setup(validator);
      const unsigned = await send();

      expect(await emulator.simulate(unsigned)).toMatchObject({
        accepted: false,
        rule:
          validator === "scalus" ? "MissingKeyHashes" : "MissingVKeyWitnesses",
      });
      expect(await emulator.submit("00")).toMatchObject({
        accepted: false,
        rule: "InvalidTransaction",
      });
      if (validator === "cquisitor") {
        expect(
          await emulator.simulate(unsigned, { requireSignatures: false }),
        ).toMatchObject({ accepted: true });
      } else {
        await expect(
          emulator.simulate(unsigned, { requireSignatures: false }),
        ).rejects.toThrow("cquisitor");
      }
    });

    it("reports script budgets, and script failures", async () => {
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
        {
          utxos: [locked(0, alwaysSucceed), locked(1, alwaysFail)],
        },
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

      const passing = await emulator.simulate(
        await wallet.signTx(await spend(0, alwaysSucceed, true)),
      );
      expect(passing.accepted).toBe(true);
      expect(passing.accepted && passing.redeemers).toEqual([
        { tag: "SPEND", index: 0, budget: expect.any(Object) },
      ]);

      // Built without evaluation, as evaluating would fail before the ledger sees it
      const failing = await emulator.simulate(
        await wallet.signTx(await spend(1, alwaysFail, false)),
      );
      expect(failing.accepted).toBe(false);
      expect(
        !failing.accepted && failing.errors.some((e) => e.phase === 2),
      ).toBe(true);
    });

    it("simulates a TransactionPrototype", async () => {
      const { emulator, fromOpen } = await setup(validator);
      const txHex = await fromOpen().complete();

      expect(
        await emulator.simulate(transactionPrototypeFromHex(txHex)),
      ).toMatchObject({ accepted: true });
    });

    it("forks the ledger into independent copies", async () => {
      const { wallet, address, emulator, send } = await setup(validator);
      const signed = await wallet.signTx(await send());
      const fork = emulator.fork();

      expect((await fork.submit(signed)).accepted).toBe(true);
      expect(fork.utxos({ address })).toHaveLength(3);
      expect(emulator.utxos({ address })).toHaveLength(2);
      expect((await emulator.submit(signed)).accepted).toBe(true);
    });

    it("moves the clock, and rejects an expired transaction", async () => {
      const { wallet, address, funding, emulator, builder } =
        await setup(validator);
      const epoch = emulator.epoch;
      const slot = emulator.advanceToEpoch();
      expect(emulator.epoch).toBe(epoch + 1);
      expect(() => emulator.advanceToEpoch(epoch)).toThrow();

      const expiring = await wallet.signTx(
        await builder()
          .txOut(address, lovelace("2000000"))
          .invalidHereafter(slot + 100)
          .changeAddress(address)
          .selectUtxosFrom([funding])
          .complete(),
      );
      expect((await emulator.simulate(expiring)).accepted).toBe(true);
      emulator.setSlot(slot + 100);
      expect(await emulator.simulate(expiring)).toMatchObject({
        accepted: false,
        rule:
          validator === "scalus"
            ? "TransactionExpired"
            : "OutsideValidityIntervalUTxO",
      });
    });

    it("rejects a transaction in its ttl slot", async () => {
      const { wallet, address, funding, emulator, builder } =
        await setup(validator);
      const ttl = emulator.slot + 100;
      const expiring = await wallet.signTx(
        await builder()
          .txOut(address, lovelace("2000000"))
          .invalidHereafter(ttl)
          .changeAddress(address)
          .selectUtxosFrom([funding])
          .complete(),
      );

      emulator.setSlot(ttl - 1);
      expect((await emulator.simulate(expiring)).accepted).toBe(true);
      emulator.setSlot(ttl);
      expect((await emulator.simulate(expiring)).accepted).toBe(false);
    });

    it("chains transactions: each sees the UTxOs and registrations of those before", async () => {
      const { emulator, fromOpen } = await setup(validator, {
        pools: [{ poolId: poolHash }],
      });

      const register = await emulator.submit(
        await fromOpen().registerStakeCertificate(openStake).complete(),
      );
      expect(register.accepted).toBe(true);
      expect(emulator.account(openStake)).toEqual({
        rewardAddress: openStake,
        deposit: 2_000_000n,
        rewards: 0n,
      });

      const change = emulator.utxos({ address: openAddress })[0]!;
      const delegate = await emulator.submit(
        await fromOpen(change)
          .delegateStakeCertificate(openStake, poolHash)
          .certificateScript(openScriptHex)
          .complete(),
      );
      expect(delegate.accepted).toBe(true);
      expect(emulator.account(openStake)?.pool).toBe(poolHash);

      const deregister = await emulator.submit(
        await fromOpen(emulator.utxos({ address: openAddress })[0]!)
          .deregisterStakeCertificate(openStake)
          .certificateScript(openScriptHex)
          .complete(),
      );
      expect(deregister.accepted).toBe(true);
      expect(emulator.account(openStake)).toBeUndefined();
    });

    it("plays a chain on a copy with simulateChain", async () => {
      const { emulator, fromOpen } = await setup(validator);
      const first = await fromOpen()
        .registerStakeCertificate(openStake)
        .complete();
      // The second spends the first's change, before the first is on any ledger
      const [change] = getTransactionOutputs(first);
      const second = await fromOpen(change!, { evaluate: false })
        .deregisterStakeCertificate(openStake)
        .certificateScript(openScriptHex)
        .complete();

      const results = await emulator.simulateChain([first, second]);

      expect(results.map((r) => r.accepted)).toEqual([true, true]);
      expect(emulator.account(openStake)).toBeUndefined();
      expect(emulator.utxos({ txHash: results[0]!.txHash! })).toEqual([]);
    });
  },
);

describe("TxEmulator (cquisitor) ledger state", () => {
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
    expect(toPool).toMatchObject({ accepted: false });
    expect(!toPool.accepted && toPool.errors.map((e) => e.rule)).toContain(
      "StakePoolNotRegistered",
    );

    const toDRep = await emulator.simulate(
      await fromOpen()
        .voteDelegationCertificate({ dRepId: openDRep }, openStake)
        .certificateScript(openScriptHex)
        .complete(),
    );
    expect(!toDRep.accepted && toDRep.errors.map((e) => e.rule)).toContain(
      "DelegateeDRepNotRegistered",
    );
  });

  it("chains a DRep registration, a vote delegation, a proposal and a vote on it", async () => {
    const { emulator, fromOpen } = await setup("cquisitor", {
      accounts: [{ rewardAddress: openStake }],
    });
    const next = () => fromOpen(emulator.utxos({ address: openAddress })[0]!);
    const expectAccepted = async (txHex: string) => {
      const result = await emulator.submit(txHex);
      expect(result.accepted ? [] : result.errors).toEqual([]);
      return result;
    };

    await expectAccepted(
      await next()
        .drepRegistrationCertificate(openDRep)
        .certificateScript(openScriptHex)
        .complete(),
    );
    expect(emulator.drep(openDRep)).toEqual({
      drepId: openDRep,
      deposit: 500_000_000n,
    });

    await expectAccepted(
      await next()
        .voteDelegationCertificate({ dRepId: openDRep }, openStake)
        .certificateScript(openScriptHex)
        .complete(),
    );
    expect(emulator.account(openStake)?.drep).toBe(openDRep);

    const proposal = await expectAccepted(
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
    );
    const action = { txHash: proposal.txHash!, index: 0 };
    expect(emulator.govAction(action)).toEqual({
      ...action,
      type: GovernanceActionKind.InfoAction,
      active: true,
    });

    const vote = (govAction: { txHash: string; index: number }) =>
      next()
        .vote(
          { type: "DRep", drepId: openDRep },
          { txHash: govAction.txHash, txIndex: govAction.index },
          { voteKind: "Yes" },
        )
        .voteScript(openScriptHex)
        .complete();
    await expectAccepted(await vote(action));

    const unknown = await emulator.simulate(
      await vote({ txHash: "e".repeat(64), index: 0 }),
    );
    expect(!unknown.accepted && unknown.errors.map((e) => e.rule)).toContain(
      "GovActionsDoNotExist",
    );
  });

  it("retires a pool once the clock reaches its retirement epoch", async () => {
    const { emulator } = await setup("cquisitor", {
      pools: [{ poolId: poolHash, retirementEpoch: 0 }],
    });
    expect(emulator.pool(poolHash)).toBeDefined();
    emulator.advanceToEpoch();
    expect(emulator.pool(poolHash)).toBeUndefined();
  });
});

describe.each(["scalus", "cquisitor"] as const)(
  "TxEmulator.fromChain (%s)",
  (validator) => {
    /** A provider reading from another emulator, standing in for the chain */
    const providerFor = (chain: TxEmulator, extended: boolean): IFetcher => {
      const base = Object.create(chain.provider) as IFetcherExtended;
      base.fetchAccountInfo = async (rewardAddress) => {
        const account = chain.account(rewardAddress);
        return {
          active: account !== undefined,
          balance: "0",
          rewards: String(account?.rewards ?? 0n),
          withdrawals: "0",
          ...(account?.pool && { poolId: account.pool }),
        };
      };
      if (extended) {
        base.fetchTipSlot = async () => chain.slot;
        base.fetchPoolState = async (poolId) => ({
          poolId,
          registered: chain.pool(poolId) !== undefined,
        });
      }
      return base;
    };

    it("checks a transaction against the state a provider reports", async () => {
      const { emulator: chain, fromOpen } = await setup(validator, {
        accounts: [{ rewardAddress: openStake, rewards: 7_000_000n }],
      });
      const withdrawal = await fromOpen()
        .withdrawal(openStake, "7000000")
        .withdrawalScript(openScriptHex)
        .complete();

      const emulator = await TxEmulator.fromChain(
        providerFor(chain, false),
        withdrawal,
        { validator },
      );

      expect(emulator.account(openStake)?.rewards).toBe(7_000_000n);
      expect(await emulator.simulate(withdrawal)).toMatchObject({
        accepted: true,
      });
    });

    it("reads pools through IFetcherExtended when the provider has it", async () => {
      const { emulator: chain, fromOpen } = await setup(validator, {
        accounts: [{ rewardAddress: openStake }],
        pools: [{ poolId: poolHash }],
      });
      const delegation = await fromOpen()
        .delegateStakeCertificate(openStake, poolHash)
        .certificateScript(openScriptHex)
        .complete();

      const extended = await TxEmulator.fromChain(
        providerFor(chain, true),
        delegation,
        {
          validator,
        },
      );
      expect(await extended.simulate(delegation)).toMatchObject({
        accepted: true,
      });
      expect(extended.slot).toBe(chain.slot);

      const plain = await TxEmulator.fromChain(
        providerFor(chain, false),
        delegation,
        {
          validator,
        },
      );
      // Without pool state only cquisitor, which checks pools exist, rejects the delegation
      expect((await plain.simulate(delegation)).accepted).toBe(
        validator === "scalus",
      );
    });
  },
);
