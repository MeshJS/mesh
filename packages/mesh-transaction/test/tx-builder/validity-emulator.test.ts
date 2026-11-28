import { deserializeAddress, mConStr0, UTxO } from "@meshsdk/core";
import { Address } from "@meshsdk/core-cst";
import { TxEmulator } from "@meshsdk/tx-emulator";
import { MeshWallet } from "@meshsdk/wallet";

import {
  BuiltTxData,
  guard,
  NetworkMismatchDetails,
  output,
  spend,
  TxBuilder,
  TxBuildError,
  TxPart,
  validity,
} from "../../src/tx-builder";
import { baseAddress, vestingCbor, vestingHash } from "../test-util";

const words = Array(24).fill("solution");
const recipient = baseAddress(2);
const vesting = { code: vestingCbor, version: "V3" as const };

/** A preprod wallet of the fixture's seed, funded on the emulator with 100 and 5 ADA */
const fundedWallet = async (emulator: TxEmulator, accountIndex: number) => {
  const wallet = new MeshWallet({
    networkId: 0,
    key: { type: "mnemonic", words },
    accountIndex,
  });
  await wallet.init();
  const address = (await wallet.getChangeAddress())!;
  emulator.fund(address, { lovelace: 100_000_000n });
  emulator.fund(address, { lovelace: 5_000_000n });
  return {
    wallet,
    address,
    keyHash: deserializeAddress(address).pubKeyHash,
    /** The wallet's UTxOs on the ledger now, as a payer snapshot */
    payer: () => ({
      changeAddress: address,
      utxos: emulator.utxos({ address }),
    }),
  };
};

/** An emulator of preprod held at a fixed slot, so every run builds the same transactions */
const preprodEmulator = (validator: "scalus" | "cquisitor") =>
  TxEmulator.create({ validator, network: "preprod", slot: 100_000_000 });

/*
 * Time bounds converted to slots by the builder, checked by the emulator's ledger and by a
 * script that reads the interval.
 */
describe("TxBuilder validity on TxEmulator", () => {
  // The first test of the file loads the validator: on a busy machine that alone takes seconds
  it("unlocks a vesting script with from: deadline + 1, its comparison being strict", async () => {
    const emulator = await preprodEmulator("scalus");
    const builder = new TxBuilder({
      network: "preprod",
      provider: emulator,
      evaluator: emulator,
    });
    const owner = await fundedWallet(emulator, 0);
    const beneficiary = await fundedWallet(emulator, 1);
    const scriptAddress = builder.scriptAddress(vesting);
    expect(deserializeAddress(scriptAddress).scriptHash).toBe(vestingHash);

    // Two locks: until the start of a slot, and until the middle of the next one
    const lockUntil = emulator.time + 3_600_000;
    const lockUntil2 = lockUntil + 400;
    const lockTo = (until: number) =>
      output({
        address: scriptAddress,
        value: { lovelace: 50_000_000n },
        datum: {
          type: "inline",
          data: mConStr0([until, owner.keyHash, beneficiary.keyHash]),
        },
      });
    const lock = await builder.build([lockTo(lockUntil), lockTo(lockUntil2)], {
      payer: owner.payer(),
    });
    expect(await emulator.submitTx(await owner.wallet.signTx(lock.tx))).toBe(
      lock.txHash,
    );

    emulator.advanceTo({ time: lockUntil + 60_000 });
    const lockedAt = (outputIndex: number): UTxO =>
      emulator
        .utxos({ address: scriptAddress })
        .find((u) => u.input.outputIndex === outputIndex)!;
    // The script reads the beneficiary among the signatories: a guard of the wallet's payment
    // key, given by its address, in bech32 and in hex
    const signerAddress = (await beneficiary.wallet.getChangeAddress())!;
    const signerAddressHex = Address.fromBech32(signerAddress).toBytes();
    const unlock = (utxo: UTxO, window: TxPart, address = signerAddress) =>
      builder.build(
        [
          spend.plutus({
            utxo,
            script: vesting,
            redeemer: { data: mConStr0([]) },
            label: "unlock",
          }),
          guard.pubKey({ address }),
          window,
        ],
        { payer: beneficiary.payer() },
      );
    const submit = async (built: BuiltTxData) =>
      expect(
        await emulator.submitTx(await beneficiary.wallet.signTx(built.tx)),
      ).toBe(built.txHash);

    // At the deadline the script's lower bound equals it, which the script refuses
    const error = await unlock(lockedAt(0), validity({ from: lockUntil })).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(TxBuildError);
    expect((error as TxBuildError).code).toBe("EVALUATION_FAILED");

    const built = await unlock(lockedAt(0), validity({ from: lockUntil + 1 }));
    expect(built.prototype.body.validity_start_interval).toBe(
      String(builder.slotAt(lockUntil) + 1),
    );
    const fromBigint = await unlock(
      lockedAt(0),
      validity({ from: BigInt(lockUntil) + 1n }),
    );
    expect(fromBigint.txHash).toBe(built.txHash);
    await submit(built);

    // A deadline inside a slot: `from` already rounds up past it
    await submit(
      await unlock(
        lockedAt(1),
        validity({ from: lockUntil2 }),
        signerAddressHex,
      ),
    );
  }, 30_000);

  it("builds one part on preprod with the emulator's time, and the ledger accepts it", async () => {
    const emulator = await preprodEmulator("scalus");
    const builder = new TxBuilder({ network: "preprod", provider: emulator });
    const payer = await fundedWallet(emulator, 0);
    const t = emulator.time;
    const built = await builder.build(
      [
        output({ address: recipient, value: { lovelace: 2_000_000n } }),
        validity({ from: t, until: t + 600000 }),
      ],
      { payer: payer.payer() },
    );
    const { body } = built.prototype;
    expect(body.validity_start_interval).toBe(String(builder.slotAt(t, "up")));
    expect(body.ttl).toBe(String(builder.slotAt(t + 600000)));
    expect(body.validity_start_interval).toBe(String(emulator.slot));
    expect(await emulator.submitTx(await payer.wallet.signTx(built.tx))).toBe(
      built.txHash,
    );
  });

  it("refuses a provider that states another network", async () => {
    const emulator = await preprodEmulator("scalus");
    let error: unknown;
    try {
      new TxBuilder({ network: "preview", provider: emulator });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(TxBuildError);
    const mismatch = error as TxBuildError<"NETWORK_MISMATCH">;
    expect(mismatch.code).toBe("NETWORK_MISMATCH");
    expect((mismatch.details as NetworkMismatchDetails).found).toEqual([
      { role: "provider", network: "preprod" },
    ]);
    expect(
      new TxBuilder({ network: "preprod", provider: emulator }).network.name,
    ).toBe("preprod");
  });
});

describe.each(["scalus", "cquisitor"] as const)(
  "TxBuilder validity on TxEmulator (%s)",
  (validator) => {
    it("gives the ledger the converted bounds", async () => {
      const emulator = await preprodEmulator(validator);
      const builder = new TxBuilder({
        network: "preprod",
        provider: emulator,
      });
      const payer = await fundedWallet(emulator, 0);
      const start = emulator.slot;
      const built = await builder.build(
        [
          output({ address: recipient, value: { lovelace: 2_000_000n } }),
          validity({
            from: emulator.time + 10_500,
            until: emulator.time + 600_000,
          }),
        ],
        { payer: payer.payer() },
      );
      const { body } = built.prototype;
      expect(body.validity_start_interval).toBe(String(start + 11));
      expect(body.ttl).toBe(String(start + 600));
      const signed = await payer.wallet.signTx(built.tx);
      const rule =
        validator === "scalus"
          ? "TransactionExpired"
          : "OutsideValidityIntervalUTxO";
      const checkAt = async (slot: number) => {
        if (slot > emulator.slot) emulator.advanceTo({ slot });
        return emulator.simulate(signed);
      };

      for (const [slot, accepted] of [
        [start, false],
        [start + 10, false],
        [start + 11, true],
        [start + 599, true],
        [start + 600, false],
      ] as const) {
        const result = await checkAt(slot);
        expect([slot - start, result.accepted]).toEqual([
          slot - start,
          accepted,
        ]);
        if (!result.accepted)
          expect(result.errors.map((e) => e.rule)).toContain(rule);
      }
    });
  },
);
