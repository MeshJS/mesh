import { deserializeAddress, mConStr0, UTxO } from "@meshsdk/core";
import { TxEmulator, TxResult } from "@meshsdk/tx-emulator";
import { MeshWallet } from "@meshsdk/wallet";

import {
  BuiltTxData,
  certificate,
  mint,
  output,
  outputOf,
  spend,
  TxBuilder,
  Utxo,
  utxosAfter,
} from "../../src/tx-builder";
import { alwaysSucceedCbor, baseAddress } from "../test-util";

const words = Array(24).fill("solution");
const recipient = baseAddress(2);

const walletOf = async (accountType: "payment" | "stake") => {
  const wallet = new MeshWallet({
    networkId: 0,
    key: { type: "mnemonic", words },
    accountType,
  });
  await wallet.init();
  return wallet;
};

/*
 * What a built transaction reports, checked by the emulator's ledger under both validators.
 */
describe.each(["scalus", "cquisitor"] as const)(
  "TxBuilder results on TxEmulator (%s)",
  (validator) => {
    it("is accepted signed by exactly the keys of signers.keyHashes, and refused without one", async () => {
      const emulator = await TxEmulator.create({
        validator,
        network: "preprod",
        slot: 100_000_000,
      });
      const builder = new TxBuilder({
        network: "preprod",
        provider: emulator,
        evaluator: emulator,
      });
      const wallets = {
        payment: await walletOf("payment"),
        stake: await walletOf("stake"),
      };
      const address = (await wallets.payment.getChangeAddress())!;
      const stake = (await wallets.payment.getRewardAddresses())[0]!;
      emulator.fund(address, { lovelace: 100_000_000n });
      const { pubKeyHash, stakeCredentialHash } = deserializeAddress(address);

      const built = await builder.build(
        [
          output({ address: recipient, value: { lovelace: 5_000_000n } }),
          certificate.stakeRegistration({ stake, label: "register" }),
        ],
        {
          payer: { changeAddress: address, utxos: emulator.utxos({ address }) },
        },
      );
      expect([...built.signers.keyHashes].sort()).toEqual(
        [pubKeyHash, stakeCredentialHash].sort(),
      );
      expect(built.signers.keys).toEqual(
        expect.arrayContaining([
          { keyHash: pubKeyHash, roles: ["input"] },
          { keyHash: stakeCredentialHash, roles: ["certificate"] },
        ]),
      );

      // The wallet of each key signs, and only those
      const keyOf = { payment: pubKeyHash, stake: stakeCredentialHash };
      const signWith = async (tx: BuiltTxData, skip?: string) => {
        let signed = tx.tx;
        for (const role of ["payment", "stake"] as const) {
          const keyHash = keyOf[role];
          if (!tx.signers.keyHashes.includes(keyHash) || keyHash === skip)
            continue;
          signed = await wallets[role].signTx(signed, role !== "payment");
        }
        return signed;
      };

      const fork = emulator.fork();
      await expect(
        fork.submitTx(await signWith(built, stakeCredentialHash)),
      ).rejects.toThrow(stakeCredentialHash);
      expect(await emulator.submitTx(await signWith(built))).toBe(built.txHash);
    });
  },
);

const alice = baseAddress(3);
const bob = baseAddress(4);
const plutusScript = { code: alwaysSucceedCbor, version: "V3" as const };

const rules = (result: TxResult) =>
  result.accepted ? [] : result.errors.map((e) => e.rule);
const outRefs = (utxos: readonly (UTxO | Utxo)[]) =>
  utxos.map((u) => {
    const { txHash, outputIndex } = "input" in u ? u.input : u;
    return `${txHash}#${outputIndex}`;
  });
const pay = (address: string, lovelace: bigint) =>
  output({ address, value: { lovelace } });

/** An emulator of preprod at a fixed slot, a builder on it, and a wallet holding one UTxO */
const chainSetup = async (validator: "scalus" | "cquisitor") => {
  const emulator = await TxEmulator.create({
    validator,
    network: "preprod",
    slot: 100_000_000,
  });
  const builder = new TxBuilder({
    network: "preprod",
    provider: emulator,
    evaluator: emulator,
  });
  const wallet = await walletOf("payment");
  const address = (await wallet.getChangeAddress())!;
  emulator.fund(address, { lovelace: 100_000_000n });
  const snapshot = () => ({
    changeAddress: address,
    utxos: emulator.utxos({ address }),
  });
  const sign = (built: BuiltTxData) => wallet.signTx(built.tx);
  return { emulator, builder, address, snapshot, sign };
};

/*
 * Transactions built on top of others the ledger has not seen yet, then submitted in order.
 */
describe.each(["scalus", "cquisitor"] as const)(
  "TxBuilder chains on TxEmulator (%s)",
  (validator) => {
    it("builds a payment after another one before it is submitted; without after it spends a spent input", async () => {
      const { emulator, builder, snapshot, sign } = await chainSetup(validator);
      const payer = snapshot();
      expect(payer.utxos).toHaveLength(1);
      const tx1 = await builder.build(pay(alice, 10_000_000n), { payer });
      const tx2 = await builder.build(pay(bob, 5_000_000n), {
        payer,
        after: tx1,
      });
      const unchained = await builder.build(pay(bob, 5_000_000n), { payer });
      expect(outRefs(unchained.inputs)).toEqual(outRefs(tx1.inputs));

      expect(await emulator.submitTx(await sign(tx1))).toBe(tx1.txHash);
      const fork = emulator.fork();
      expect(await emulator.submitTx(await sign(tx2))).toBe(tx2.txHash);
      expect(rules(await fork.submit(await sign(unchained)))).toEqual([
        "UtxoNotAvailable",
      ]);
    });

    it("builds three transactions on one read of the payer, folded with utxosAfter", async () => {
      const { emulator, builder, address, sign } = await chainSetup(validator);
      let payer = await builder.readPayer(address);
      const built: BuiltTxData[] = [];
      for (const lovelace of [10_000_000n, 7_000_000n, 3_000_000n]) {
        const tx = await builder.build(pay(alice, lovelace), { payer });
        built.push(tx);
        payer = { ...payer, utxos: utxosAfter(payer.utxos, tx) };
      }
      const spent = built.flatMap((tx) => outRefs(tx.inputs));
      expect(new Set(spent).size).toBe(spent.length);
      for (const tx of built)
        expect(await emulator.submitTx(await sign(tx))).toBe(tx.txHash);
    });

    it("spends the change of an unsubmitted transaction by a part", async () => {
      const { emulator, builder, snapshot, sign } = await chainSetup(validator);
      const payer = snapshot();
      const tx1 = await builder.build(pay(alice, 10_000_000n), { payer });
      const tx2 = await builder.build(
        [spend.pubKey({ utxo: tx1.change[0]! }), pay(bob, 5_000_000n)],
        { payer, after: tx1 },
      );
      expect(outRefs(tx2.inputs)).toEqual(outRefs(tx1.change));
      expect(await emulator.submitTx(await sign(tx1))).toBe(tx1.txHash);
      expect(await emulator.submitTx(await sign(tx2))).toBe(tx2.txHash);
    });

    it("locks and unlocks by label before the lock is submitted", async () => {
      const { emulator, builder, snapshot, sign } = await chainSetup(validator);
      const payer = snapshot();
      const lock = await builder.build(
        output({
          address: builder.scriptAddress(plutusScript),
          value: { lovelace: 20_000_000n },
          datum: { type: "inline", data: mConStr0([]) },
          label: "vesting",
        }),
        { payer },
      );
      const unlock = await builder.build(
        [
          spend.plutus({
            utxo: outputOf(lock, "vesting"),
            script: plutusScript,
            redeemer: { data: mConStr0([]) },
          }),
          pay(bob, 5_000_000n),
        ],
        { payer, after: lock },
      );
      // The wallet's only UTxO is spent by the lock: the collateral is the lock's change
      expect(outRefs(unlock.collateral!.inputs)).toEqual(outRefs(lock.change));
      expect(await emulator.submitTx(await sign(lock))).toBe(lock.txHash);
      expect(await emulator.submitTx(await sign(unlock))).toBe(unlock.txHash);
    });

    it("evaluates a script on the change a snapshot folded with utxosAfter holds, before the first is submitted", async () => {
      const { emulator, builder, snapshot, sign } = await chainSetup(validator);
      expect(emulator.acceptsKnownUtxos).toBe(true);
      const payer = snapshot();
      const tx1 = await builder.build(pay(alice, 10_000_000n), { payer });
      // The payer's only UTxO is spent by tx1: inputs and collateral are tx1's change
      const tx2 = await builder.build(
        mint.plutus({
          script: plutusScript,
          redeemer: { data: mConStr0([]) },
          assets: { "6d": 1n },
        }),
        { payer: { ...payer, utxos: utxosAfter(payer.utxos, tx1) } },
      );
      expect(outRefs(tx2.inputs)).toEqual(outRefs(tx1.change));
      expect(outRefs(tx2.collateral!.inputs)).toEqual(outRefs(tx1.change));
      expect(await emulator.submitTx(await sign(tx1))).toBe(tx1.txHash);
      expect(await emulator.submitTx(await sign(tx2))).toBe(tx2.txHash);
    });

    it("evaluates a script when it is handed UTxOs its ledger already holds", async () => {
      const { emulator, builder, snapshot, sign } = await chainSetup(validator);
      const payer = snapshot();
      const evaluateTx = jest.spyOn(emulator, "evaluateTx");
      const built = await builder.build(
        mint.plutus({
          script: plutusScript,
          redeemer: { data: mConStr0([]) },
          assets: { "6d": 1n },
        }),
        { payer },
      );
      expect(built.redeemers[0]!.exUnits.mem).toBeGreaterThan(0n);
      expect(outRefs(built.inputs)).toEqual(outRefs(payer.utxos));
      expect(evaluateTx).toHaveBeenCalled();
      for (const [, handed] of evaluateTx.mock.calls)
        expect(outRefs(handed!)).toEqual(outRefs(payer.utxos));
      expect(await emulator.submitTx(await sign(built))).toBe(built.txHash);
    });
  },
);
