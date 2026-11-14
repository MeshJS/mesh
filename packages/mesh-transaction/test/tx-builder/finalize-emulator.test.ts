import { deserializeAddress, mConStr0 } from "@meshsdk/core";
import { TxEmulator } from "@meshsdk/tx-emulator";
import { MeshWallet } from "@meshsdk/wallet";

import {
  addWitnesses,
  assembleTxPrototype,
  BuiltTxData,
  guard,
  message,
  output,
  signWitnesses,
  spend,
  TxBuilder,
  TxBuildError,
  TxError,
  Utxo,
} from "../../src/tx-builder";
import { alwaysSucceedCbor, baseAddress } from "../test-util";

const words = Array(24).fill("solution");
const recipient = baseAddress(2);
const plutusScript = { code: alwaysSucceedCbor, version: "V3" as const };

const walletOf = async (accountType: "payment" | "stake" = "payment") => {
  const wallet = new MeshWallet({
    networkId: 0,
    key: { type: "mnemonic", words },
    accountType,
  });
  await wallet.init();
  return wallet;
};

/** An emulator of preprod at a fixed slot, a builder on it and a funded wallet */
const setup = async (validator: "scalus" | "cquisitor") => {
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
  const wallet = await walletOf();
  const address = (await wallet.getChangeAddress())!;
  emulator.fund(address, { lovelace: 100_000_000n });
  return { emulator, builder, wallet, address };
};

/** A transaction signed by the wallet's keys */
const signed = async (wallet: MeshWallet, tx: string) =>
  addWitnesses(tx, await signWitnesses(wallet, tx));

const coins = (built: BuiltTxData) =>
  built.prototype.body.outputs.map((o) => BigInt(o.amount.coin));

describe.each(["scalus", "cquisitor"] as const)(
  "TxBuilder.finalize on TxEmulator (%s)",
  (validator) => {
    /** A payment balanced by hand: an input, two outputs and a message, with the fee given */
    const byHand = async (
      emulator: TxEmulator,
      address: string,
      fee: bigint,
    ) => {
      const input = emulator.utxos({ address })[0]!;
      const prototype = assembleTxPrototype(
        [
          spend.pubKey({ utxo: input }),
          output({ address: recipient, value: { lovelace: 5_000_000n } }),
          output({
            address,
            value: { lovelace: 100_000_000n - 5_000_000n - fee },
          }),
          message({ text: "balanced by hand" }),
        ],
        { fee },
      ).prototype;
      return { input, prototype };
    };

    it("completes a transaction balanced by hand, keeping the fee it states", async () => {
      const { emulator, builder, wallet, address } = await setup(validator);
      const { input, prototype } = await byHand(emulator, address, 200_000n);
      const final = await builder.finalize(prototype, { inputs: [input] });

      expect(final.fee).toBe(200_000n);
      expect(final.prototype.body.auxiliary_data_hash).toMatch(
        /^[0-9a-f]{64}$/,
      );
      const result = await emulator.simulate(await signed(wallet, final.tx));
      expect(result.accepted).toBe(true);
    });

    it("prices a transaction balanced by hand, taking the fee from the change output", async () => {
      const { emulator, builder, wallet, address } = await setup(validator);
      const { input, prototype } = await byHand(emulator, address, 0n);
      const final = await builder.finalize(prototype, {
        inputs: [input],
        changeAddress: address,
      });

      expect(final.fee).toBeGreaterThan(0n);
      expect(coins(final)).toEqual([5_000_000n, 95_000_000n - final.fee]);
      const result = await emulator.simulate(await signed(wallet, final.tx));
      expect(result.accepted).toBe(true);
    });

    it("completes a payment whose TTL was set by hand, raising the fee out of change", async () => {
      const { emulator, builder, wallet, address } = await setup(validator);
      const built = await builder.build(
        output({ address: recipient, value: { lovelace: 5_000_000n } }),
        { payer: address },
      );
      const edited = structuredClone(built.prototype);
      edited.body.ttl = String(builder.slotAt(emulator.time + 600_000));

      // Serialized as it is, the fee no longer covers the larger body
      const unfinished = await emulator.simulate(
        await signed(wallet, builder.serialize(edited)),
      );
      expect(unfinished.accepted).toBe(false);

      const final = await builder.finalize(edited, {
        inputs: built.inputs,
        changeAddress: address,
      });
      expect(final.fee).toBeGreaterThan(built.fee);
      const changeAt = built.outputs.findIndex((o) => o.change);
      const expected = coins(built);
      expected[changeAt] = expected[changeAt]! - (final.fee - built.fee);
      expect(coins(final)).toEqual(expected);
      const result = await emulator.simulate(await signed(wallet, final.tx));
      expect(result.accepted).toBe(true);
    });

    it("needs the signature of a guard's stake key", async () => {
      const { emulator, builder, wallet, address } = await setup(validator);
      const stake = await walletOf("stake");
      const { stakeCredentialHash } = deserializeAddress(address);
      const built = await builder.build(
        [
          output({ address: recipient, value: { lovelace: 5_000_000n } }),
          guard.pubKey({ keyHash: stakeCredentialHash }),
        ],
        { payer: address },
      );

      const paymentOnly = await signed(wallet, built.tx);
      expect((await emulator.simulate(paymentOnly)).accepted).toBe(false);
      const both = await addWitnesses(
        paymentOnly,
        await signWitnesses(stake, built.tx),
      );
      expect((await emulator.simulate(both)).accepted).toBe(true);
    });

    it("carries a message longer than one line", async () => {
      const { emulator, builder, wallet, address } = await setup(validator);
      // 200 bytes of one- and two-byte characters
      const text = "aé".repeat(66) + "ab";
      expect(new TextEncoder().encode(text).length).toBe(200);
      const built = await builder.build(
        [
          output({ address: recipient, value: { lovelace: 5_000_000n } }),
          message({ text }),
        ],
        { payer: address },
      );
      const result = await emulator.simulate(await signed(wallet, built.tx));
      expect(result.accepted).toBe(true);
    });

    it("refuses to raise the fee of a Plutus spend past its collateral, until the caller raises it", async () => {
      const { emulator, builder, wallet, address } = await setup(validator);
      const scriptAddress = builder.scriptAddress(plutusScript);
      const lock = await builder.build(
        output({
          address: scriptAddress,
          value: { lovelace: 10_000_000n },
          datum: { type: "inline", data: mConStr0([]) },
        }),
        { payer: address },
      );
      await emulator.submitTx(await signed(wallet, lock.tx));
      const built = await builder.build(
        spend.plutus({
          utxo: emulator.utxos({ address: scriptAddress })[0]!,
          script: plutusScript,
          redeemer: { data: mConStr0([]) },
        }),
        { payer: address },
      );
      const named: Utxo[] = [
        ...built.inputs,
        ...built.referenceInputs,
        ...(built.collateral?.inputs ?? []),
      ];
      const edited = structuredClone(built.prototype);
      edited.body.ttl = String(builder.slotAt(emulator.time + 600_000));
      const before = structuredClone(edited);

      const error = await builder
        .finalize(edited, { inputs: named, changeAddress: address })
        .then(
          () => undefined,
          (e: unknown) => e,
        );
      expect(error).toBeInstanceOf(TxBuildError);
      if (!TxError.is(error, "INSUFFICIENT_COLLATERAL")) throw error;
      expect(error.details.available).toBe(
        BigInt(built.prototype.body.total_collateral!),
      );
      expect(error.details.required).toBeGreaterThan(error.details.available);
      expect(edited).toEqual(before);

      // Raised by hand, with room for a fee a byte higher
      const raise = error.details.required + 1_000n - error.details.available;
      const total = String(error.details.available + raise);
      edited.body.total_collateral = total;
      const collateralReturn = edited.body.collateral_return!;
      const returned = String(BigInt(collateralReturn.amount.coin) - raise);
      collateralReturn.amount.coin = returned;
      const final = await builder.finalize(edited, {
        inputs: named,
        changeAddress: address,
      });

      expect(final.fee).toBeGreaterThan(built.fee);
      expect(final.prototype.body.total_collateral).toBe(total);
      expect(final.prototype.body.collateral_return!.amount.coin).toBe(
        returned,
      );
      expect(final.prototype.body.script_data_hash).toBe(
        built.prototype.body.script_data_hash,
      );
      const result = await emulator.simulate(await signed(wallet, final.tx));
      expect(result.accepted).toBe(true);
    });
  },
);
