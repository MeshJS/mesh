import type { UTxO } from "@meshsdk/common";
import { CachedFetcher, mConStr0, resolveScriptRef } from "@meshsdk/core";
import { deserializeTx, resolvePlutusScriptAddress } from "@meshsdk/core-cst";
import { ScalusEmulator } from "@meshsdk/scalus-emulator";
import { TxEmulator } from "@meshsdk/tx-emulator";
import { BrowserWallet, MeshWallet } from "@meshsdk/wallet";

import {
  addWitnesses,
  collateral,
  OutputDatum,
  signWitnesses,
  spend,
  TxBuilder,
  Utxo,
} from "../../src/tx-builder";
import { cip30Wallet } from "../cip30-wallet";
import { alwaysFailCbor, alwaysSucceedCbor } from "../test-util";
import { markedFailing } from "./cbor-util";
import { asCbor, asMesh, ref } from "./utxo-util";

const words = Array(24).fill("solution");
const plutusScript = { code: alwaysSucceedCbor, version: "V3" as const };
const scriptAddress = resolvePlutusScriptAddress(plutusScript, 0);
const unitInline: OutputDatum = {
  type: "inline",
  data: { type: "CBOR", content: "d87980" },
};

/*
 * The collateral a CIP-30 wallet gives when its UTxO list holds none, put up in a transaction the
 * emulator's ledger accepts.
 */
describe("TxBuilder collateral fallback on the emulator", () => {
  it("puts up the UTxO getCollateral gives, for a wallet whose UTxO list is empty", async () => {
    const reader = new MeshWallet({
      networkId: 0,
      key: { type: "mnemonic", words },
    });
    await reader.init();
    const address = (await reader.getChangeAddress())!;
    const reserve: Utxo = {
      txHash: "0".repeat(64),
      outputIndex: 0,
      address,
      value: { lovelace: 5_000_000n },
    };
    const locked: Utxo = {
      txHash: "0".repeat(64),
      outputIndex: 1,
      address: scriptAddress,
      value: { lovelace: 20_000_000n },
      datum: unitInline,
    };
    const emulator = await ScalusEmulator.create([reserve, locked].map(asMesh));
    const asked: string[] = [];
    const api = await cip30Wallet({
      words,
      fetcher: new CachedFetcher(emulator, { volatileTtlMs: 0 }),
      utxos: async () => [],
      collateral: async ({ amount }) => {
        asked.push(amount);
        return [asCbor(reserve)];
      },
    });
    const builder = new TxBuilder({ network: "preview", provider: emulator });
    const unlock = () =>
      spend.plutus({
        utxo: { txHash: locked.txHash, outputIndex: 1 },
        script: plutusScript,
        redeemer: { data: mConStr0([]) },
      });

    // Without the fallback the wallet has nothing to put up
    const bare = await cip30Wallet({
      words,
      fetcher: new CachedFetcher(emulator, { volatileTtlMs: 0 }),
      utxos: async () => [],
    });
    await expect(
      builder.build(unlock(), { payer: bare }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_COLLATERAL" });

    const built = await builder.build(unlock(), { payer: api });
    expect(asked).toHaveLength(1);
    expect(built.collateral!.inputs.map((u) => u.outputIndex)).toEqual([0]);
    expect(built.selectedInputs).toEqual([]);

    // Signed by the payment key alone, whose UTxO is the collateral
    const witnesses = await api.signTx(built.tx, false);
    const tx = BrowserWallet.addBrowserWitnesses(built.tx, witnesses);
    expect(await emulator.submitTx(tx)).toBe(built.txHash);
    // The collateral is not spent: the script did not fail
    expect(await emulator.fetchAddressUTxOs(address)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ input: ref(reserve) }),
      ]),
    );
  });
});

/** The lovelace of UTxOs in the Mesh form */
const lovelaceOf = (utxos: readonly UTxO[]) =>
  utxos.reduce(
    (total, u) =>
      total +
      BigInt(u.output.amount.find((a) => a.unit === "lovelace")!.quantity),
    0n,
  );

/*
 * Collateral given by a part that does not cover what the fee calls for, topped up from the
 * payer's UTxOs, in transactions each validator accepts.
 */
describe.each(["scalus", "cquisitor"] as const)(
  "TxBuilder topping up given collateral on TxEmulator (%s)",
  (validator) => {
    /** An emulator, a funded wallet, its given collateral too small to cover, a locked output */
    const setup = async (script: { code: string; version: "V3" }) => {
      const emulator = await TxEmulator.create({
        validator,
        network: "preprod",
        slot: 100_000_000,
      });
      const wallet = new MeshWallet({
        networkId: 0,
        key: { type: "mnemonic", words },
      });
      await wallet.init();
      const address = (await wallet.getChangeAddress())!;
      const given = emulator.fund(address, { lovelace: 200_000n });
      const five = emulator.fund(address, { lovelace: 5_000_000n });
      emulator.fund(address, { lovelace: 100_000_000n });
      emulator.addUtxos([
        {
          input: { txHash: "7".repeat(64), outputIndex: 0 },
          output: {
            address: resolvePlutusScriptAddress(script, 0),
            amount: [{ unit: "lovelace", quantity: "20000000" }],
            plutusData: "d87980",
          },
        },
      ]);
      const unlock = (exUnits?: { mem: number; steps: number }) => [
        spend.plutus({
          utxo: { txHash: "7".repeat(64), outputIndex: 0 },
          script,
          redeemer: { data: mConStr0([]), ...(exUnits && { exUnits }) },
        }),
        collateral({ utxo: given.input, label: "given" }),
      ];
      return { emulator, wallet, address, given, five, unlock };
    };

    it("puts up the given input and a payer's UTxO, and the ledger accepts the spend", async () => {
      const { emulator, wallet, address, given, five, unlock } =
        await setup(plutusScript);
      const builder = new TxBuilder({
        network: "preprod",
        provider: emulator,
        evaluator: emulator,
      });
      const built = await builder.build(unlock(), { payer: address });
      expect(built.collateral!.inputs.map(ref)).toEqual([
        given.input,
        five.input,
      ]);
      expect(built.collateral!.total).toBeGreaterThan(200_000n);
      const tx = await addWitnesses(
        built.tx,
        await signWitnesses(wallet, built.tx),
      );
      const result = await emulator.submit(tx);
      if (!result.accepted) throw new Error(JSON.stringify(result));
      expect(result.isValid).toBe(true);
      // Used as given, the input alone is refused before anything is sent
      await expect(
        builder.build(unlock(), { payer: address, topUpCollateral: false }),
      ).rejects.toMatchObject({ code: "INSUFFICIENT_COLLATERAL" });
    });

    it("forfeits the total the build stated when the script fails, and returns the rest", async () => {
      const failing = { code: alwaysFailCbor, version: "V3" as const };
      const { emulator, wallet, address, given, five, unlock } =
        await setup(failing);
      // The failing script cannot be evaluated: its units are stated
      const builder = new TxBuilder({
        network: "preprod",
        provider: emulator,
        evaluator: null,
      });
      const built = await builder.build(
        unlock({ mem: 1_000_000, steps: 500_000_000 }),
        { payer: address },
      );
      const { inputs, total, return: returned } = built.collateral!;
      expect(inputs.map(ref)).toEqual([given.input, five.input]);
      const marked = markedFailing(
        await addWitnesses(built.tx, await signWitnesses(wallet, built.tx)),
      );
      const result = await emulator.submit(marked);
      if (!result.accepted) throw new Error(JSON.stringify(result));
      expect(result.isValid).toBe(false);
      expect(result.consumed.map((u) => u.input)).toEqual(
        expect.arrayContaining([given.input, five.input]),
      );
      expect(result.consumed).toHaveLength(2);
      expect(lovelaceOf(result.consumed) - lovelaceOf(result.produced)).toBe(
        total,
      );
      expect(lovelaceOf(result.produced)).toBe(returned!.value.lovelace);
      // What the chain records the transaction paid: the collateral, not the fee
      const info = await emulator.fetchTxInfo(built.txHash);
      expect([info.fees, info.validContract]).toEqual([
        total.toString(),
        false,
      ]);
    });
  },
);

/*
 * Collateral without a return: the body holds collateral inputs only, each validator accepts the
 * transaction, and a failing script takes all of their lovelace.
 */
describe.each(["scalus", "cquisitor"] as const)(
  "TxBuilder collateral without a return on TxEmulator (%s)",
  (validator) => {
    const token = `${"ab".repeat(28)}746f6b656e`;
    /** An emulator, a funded wallet holding a smaller UTxO with a token, a locked output */
    const setup = async (script: { code: string; version: "V3" }) => {
      const emulator = await TxEmulator.create({
        validator,
        network: "preprod",
        slot: 100_000_000,
      });
      const wallet = new MeshWallet({
        networkId: 0,
        key: { type: "mnemonic", words },
      });
      await wallet.init();
      const address = (await wallet.getChangeAddress())!;
      const tokens = emulator.fund(address, {
        lovelace: 3_000_000n,
        [token]: 1n,
      });
      const four = emulator.fund(address, { lovelace: 4_000_000n });
      emulator.fund(address, { lovelace: 100_000_000n });
      emulator.addUtxos([
        {
          input: { txHash: "8".repeat(64), outputIndex: 0 },
          output: {
            address: resolvePlutusScriptAddress(script, 0),
            amount: [{ unit: "lovelace", quantity: "20000000" }],
            plutusData: "d87980",
          },
        },
      ]);
      const unlock = (exUnits?: { mem: number; steps: number }) =>
        spend.plutus({
          utxo: { txHash: "8".repeat(64), outputIndex: 0 },
          script,
          redeemer: { data: mConStr0([]), ...(exUnits && { exUnits }) },
        });
      return { emulator, wallet, address, tokens, four, unlock };
    };

    it("puts up a lovelace-only UTxO with neither return nor total, and the ledger accepts the spend", async () => {
      const { emulator, wallet, address, four, unlock } =
        await setup(plutusScript);
      const builder = new TxBuilder({
        network: "preprod",
        provider: emulator,
        evaluator: emulator,
      });
      const built = await builder.build(unlock(), {
        payer: address,
        collateralReturn: false,
      });
      // The UTxO holding a token is smaller, and is passed over
      expect(built.collateral!.inputs.map(ref)).toEqual([four.input]);
      expect(built.collateral!.total).toBe(4_000_000n);
      expect(built.collateral!.return).toBeUndefined();
      const body = deserializeTx(built.tx).body();
      expect(body.collateral()!.values()).toHaveLength(1);
      expect(body.collateralReturn()).toBeUndefined();
      expect(body.totalCollateral()).toBeUndefined();
      const tx = await addWitnesses(
        built.tx,
        await signWitnesses(wallet, built.tx),
      );
      const result = await emulator.submit(tx);
      if (!result.accepted) throw new Error(JSON.stringify(result));
      expect(result.isValid).toBe(true);
      // The collateral is not spent: the script did not fail
      expect(emulator.utxos({ txHash: four.input.txHash })).toHaveLength(1);
    });

    it("puts up a UTxO holding a reference script when nothing else covers, and the ledger accepts it", async () => {
      const { emulator, wallet, address, unlock } = await setup(plutusScript);
      emulator.addUtxos([
        {
          input: { txHash: "9".repeat(64), outputIndex: 0 },
          output: {
            address,
            amount: [{ unit: "lovelace", quantity: "6000000" }],
            scriptRef: resolveScriptRef(plutusScript),
          },
        },
      ]);
      const holder = { txHash: "9".repeat(64), outputIndex: 0 };
      const builder = new TxBuilder({
        network: "preprod",
        provider: emulator,
        evaluator: emulator,
      });
      // Only the holder may be selected: the script's output pays for the transaction
      const built = await builder.build(unlock(), {
        payer: address,
        collateralReturn: false,
        canSelect: (u) => u.txHash === holder.txHash,
      });
      expect(built.collateral!.inputs.map(ref)).toEqual([holder]);
      expect(built.collateral!.total).toBe(6_000_000n);
      expect(built.collateral!.return).toBeUndefined();
      const tx = await addWitnesses(
        built.tx,
        await signWitnesses(wallet, built.tx),
      );
      const result = await emulator.submit(tx);
      if (!result.accepted) throw new Error(JSON.stringify(result));
      expect(result.isValid).toBe(true);
    });

    it("takes all the lovelace of the collateral inputs when the script fails", async () => {
      const failing = { code: alwaysFailCbor, version: "V3" as const };
      const { emulator, wallet, address, four, unlock } = await setup(failing);
      const builder = new TxBuilder({
        network: "preprod",
        provider: emulator,
        evaluator: null,
      });
      const built = await builder.build(
        unlock({ mem: 1_000_000, steps: 500_000_000 }),
        { payer: address, collateralReturn: false },
      );
      const { inputs, total } = built.collateral!;
      expect(inputs.map(ref)).toEqual([four.input]);
      const marked = markedFailing(
        await addWitnesses(built.tx, await signWitnesses(wallet, built.tx)),
      );
      const result = await emulator.submit(marked);
      if (!result.accepted) throw new Error(JSON.stringify(result));
      expect(result.isValid).toBe(false);
      expect(result.consumed.map((u) => u.input)).toEqual([four.input]);
      expect(result.produced).toEqual([]);
      expect(lovelaceOf(result.consumed)).toBe(total);
      expect(total).toBe(4_000_000n);
      // What the chain records the transaction paid: all of the collateral
      const info = await emulator.fetchTxInfo(built.txHash);
      expect([info.fees, info.validContract]).toEqual(["4000000", false]);
    });
  },
);
