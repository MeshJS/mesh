import {
  applyCborEncoding,
  mConStr0,
  MeshTxBuilder,
  NativeScript,
  resolveNativeScriptAddress,
  resolveNativeScriptHex,
  resolvePlutusScriptAddress,
  UTxO,
} from "@meshsdk/core";
import { Cardano, transactionPrototypeFromHex } from "@meshsdk/core-cst";
import { MeshWallet } from "@meshsdk/wallet";

import { TxEmulator } from "../src";

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
const DREP_ID = Cardano.DRepID.cip129FromCredential({
  type: Cardano.CredentialType.KeyHash,
  hash: "cd".repeat(28) as never,
}).toString();
const outRef = (n: number) => ({
  txHash: String(n).repeat(64),
  outputIndex: 0,
});

async function setup(extraUtxos: (address: string) => UTxO[] = () => []) {
  const wallet = new MeshWallet({
    networkId: 1,
    key: { type: "mnemonic", words: Array(24).fill("solution") },
  });
  await wallet.init();
  const address = (await wallet.getChangeAddress())!;
  const rewardAddress = (await wallet.getRewardAddresses())![0]!;
  const funding: UTxO = {
    input: outRef(0),
    output: { address, amount: lovelace("10000000000") },
  };
  const collateral: UTxO = {
    input: outRef(1),
    output: { address, amount: lovelace("5000000") },
  };
  const emulator = await TxEmulator.create({
    utxos: [funding, collateral, ...extraUtxos(address)],
    stakeRegistrations: [
      { rewardAddress, rewards: 7_000_000n, pool: "ab".repeat(28) },
    ],
    drepRegistrations: [{ drepId: DREP_ID }],
    datums: ["d87980"],
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
  return {
    wallet,
    address,
    rewardAddress,
    funding,
    collateral,
    emulator,
    builder,
    send,
  };
}

describe("TxEmulator", () => {
  it("emulates mainnet by default", async () => {
    const emulator = await TxEmulator.create();
    expect(emulator.emulator.getCardanoInfo().network).toBe("mainnet");
    const preview = await TxEmulator.create({ network: "preview" });
    expect(preview.emulator.getCardanoInfo().network).toBe("testnet");
  });

  it("simulates a transaction without changing the ledger", async () => {
    const { wallet, address, funding, emulator, send } = await setup();
    const signed = await wallet.signTx(await send());

    const result = await emulator.simulate(signed);

    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.txHash).toHaveLength(64);
    expect(result.fee).toBeGreaterThan(0n);
    expect(result.isValid).toBe(true);
    expect(result.redeemers).toEqual([]);
    expect(result.consumed).toEqual([funding]);
    expect(result.produced).toHaveLength(2);
    expect(result.produced.every((u) => u.input.txHash === result.txHash)).toBe(
      true,
    );
    expect(emulator.utxos({ address })).toHaveLength(2);
    expect(emulator.utxos({ txHash: result.txHash })).toEqual([]);
  });

  it("keeps an accepted transaction's effects on submit", async () => {
    const { wallet, address, emulator, send } = await setup();
    const signed = await wallet.signTx(await send());

    const result = await emulator.submit(signed);

    expect(result.accepted).toBe(true);
    expect(emulator.utxos({ txHash: result.txHash! })).toHaveLength(2);
    expect(emulator.utxos({ address })).toHaveLength(3);

    const again = await emulator.simulate(signed);
    expect(again).toMatchObject({ accepted: false, rule: "UtxoNotAvailable" });
  });

  it("reports the rule that rejects a transaction", async () => {
    const { emulator, send } = await setup();

    expect(await emulator.simulate(await send())).toMatchObject({
      accepted: false,
      rule: "MissingKeyHashes",
    });
    expect(await emulator.submit("00")).toMatchObject({
      accepted: false,
      rule: "InvalidTransaction",
    });
  });

  it("reports script budgets, and script failures with their rule", async () => {
    const lockAt = (outputIndex: number, script: typeof alwaysSucceed) => ({
      input: { txHash: "9".repeat(64), outputIndex },
      output: {
        address: resolvePlutusScriptAddress(script, 1),
        amount: lovelace("20000000"),
        plutusData: "d87980",
      },
    });
    const { wallet, address, collateral, emulator, builder } = await setup(
      () => [lockAt(0, alwaysSucceed), lockAt(1, alwaysFail)],
    );
    // Built without evaluation, as evaluating would fail before the ledger sees it
    const failingTx = () =>
      builder({ evaluate: false })
        .spendingPlutusScriptV3()
        .txIn("9".repeat(64), 1)
        .txInInlineDatumPresent()
        .txInRedeemerValue(mConStr0([]), "Mesh", {
          mem: 1_000_000,
          steps: 500_000_000,
        })
        .txInScript(alwaysFail.code)
        .txInCollateral(
          collateral.input.txHash,
          collateral.input.outputIndex,
          collateral.output.amount,
          collateral.output.address,
        )
        .changeAddress(address)
        .complete();

    const passing = await emulator.simulate(
      await wallet.signTx(
        await builder()
          .spendingPlutusScriptV3()
          .txIn("9".repeat(64), 0)
          .txInInlineDatumPresent()
          .txInRedeemerValue(mConStr0([]))
          .txInScript(alwaysSucceed.code)
          .txInCollateral(
            collateral.input.txHash,
            collateral.input.outputIndex,
            collateral.output.amount,
            collateral.output.address,
          )
          .changeAddress(address)
          .complete(),
      ),
    );
    expect(passing.accepted).toBe(true);
    expect(passing.accepted && passing.redeemers).toEqual([
      { tag: "SPEND", index: 0, budget: expect.any(Object) },
    ]);

    const failing = await emulator.simulate(
      await wallet.signTx(await failingTx()),
    );
    expect(failing).toMatchObject({ accepted: false, rule: "ScriptFailure" });
  });

  it("simulates a TransactionPrototype", async () => {
    const nativeScript: NativeScript = { type: "all", scripts: [] };
    const { address, emulator, builder } = await setup(() => [
      {
        input: outRef(5),
        output: {
          address: resolveNativeScriptAddress(nativeScript, 1),
          amount: lovelace("20000000"),
        },
      },
    ]);
    // Needs no signature, so re-encoding the decoded transaction keeps it valid
    const txHex = await builder()
      .txIn(
        outRef(5).txHash,
        0,
        lovelace("20000000"),
        resolveNativeScriptAddress(nativeScript, 1),
        0,
      )
      .txInScript(resolveNativeScriptHex(nativeScript))
      .changeAddress(address)
      .complete();

    const result = await emulator.simulate(transactionPrototypeFromHex(txHex));

    expect(result).toMatchObject({ accepted: true });
  });

  it("forks the ledger into independent copies", async () => {
    const { wallet, address, emulator, send } = await setup();
    const signed = await wallet.signTx(await send());
    const fork = emulator.fork();

    expect((await fork.submit(signed)).accepted).toBe(true);
    expect(fork.utxos({ address })).toHaveLength(3);
    expect(emulator.utxos({ address })).toHaveLength(2);
    expect((await emulator.submit(signed)).accepted).toBe(true);
  });

  it("moves the clock, and rejects an expired transaction", async () => {
    const { wallet, address, funding, emulator, builder } = await setup();
    const start = emulator.slot;

    emulator.tick(10);
    expect(emulator.slot).toBe(start + 10);
    const epoch = emulator.epoch;
    const slot = emulator.advanceToEpoch();
    expect(emulator.epoch).toBe(epoch + 1);
    expect(emulator.slot).toBe(slot);
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
      rule: "TransactionExpired",
    });
  });

  it("starts from registered stake, delegations and DReps", async () => {
    const { rewardAddress, emulator } = await setup();

    expect(emulator.delegation(rewardAddress)).toEqual({
      pool: "ab".repeat(28),
      rewards: 7_000_000n,
    });
  });
});
