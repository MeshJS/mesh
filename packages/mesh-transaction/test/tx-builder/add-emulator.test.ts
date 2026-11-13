import { mConStr0 } from "@meshsdk/core";
import { TxEmulator } from "@meshsdk/tx-emulator";
import { MeshWallet } from "@meshsdk/wallet";

import { BuiltTx, output, spend, TxBuilder } from "../../src/tx-builder";
import { alwaysSucceedCbor, baseAddress } from "../test-util";
import { ref } from "./utxo-util";

const words = Array(24).fill("solution");
const script = { code: alwaysSucceedCbor, version: "V3" as const };

/**
 * A preprod wallet of the fixture's seed, funded on the emulator. It has no fetcher: the builder
 * reads its UTxOs through the emulator in every build, past any cache.
 */
const fundedWallet = async (emulator: TxEmulator) => {
  const wallet = new MeshWallet({
    networkId: 0,
    key: { type: "mnemonic", words },
  });
  await wallet.init();
  const address = (await wallet.getChangeAddress())!;
  emulator.fund(address, { lovelace: 100_000_000n });
  emulator.fund(address, { lovelace: 5_000_000n });
  return wallet;
};

/*
 * Parts held by a builder reach transactions the ledger accepts.
 */
describe("TxBuilder.add on TxEmulator", () => {
  let emulator: TxEmulator;
  let builder: TxBuilder;
  let wallet: MeshWallet;

  beforeEach(async () => {
    emulator = await TxEmulator.create({
      validator: "scalus",
      network: "preprod",
    });
    builder = new TxBuilder({ network: "preprod", provider: emulator });
    wallet = await fundedWallet(emulator);
  });

  const submit = async (built: BuiltTx) =>
    expect(await emulator.submitTx(await wallet.signTx(built.tx))).toBe(
      built.txHash,
    );

  it("unlocks a script output with the parts a builder holds", async () => {
    const scriptAddress = builder.scriptAddress(script);
    const lock = await builder.build(
      output({
        address: scriptAddress,
        value: { lovelace: 20_000_000n },
        datum: { type: "inline", data: mConStr0([]) },
      }),
      { payer: wallet },
    );
    await submit(lock);
    const utxo = emulator.utxos({ address: scriptAddress })[0]!;

    const recipient = baseAddress(2);
    const unlocking = builder.add(
      spend.plutus({ utxo, script, redeemer: { data: mConStr0([]) } }),
      output({
        label: "payout",
        address: recipient,
        value: { lovelace: 15_000_000n },
      }),
    );
    const built = await unlocking.build([], { payer: wallet });
    expect(built.inputs.map(ref)).toContainEqual(utxo.input);
    expect(built.outputs[0]).toMatchObject({
      label: "payout",
      address: recipient,
    });
    await submit(built);
    expect(emulator.utxos({ address: scriptAddress })).toEqual([]);
    expect(
      emulator.utxos({ address: recipient }).map((u) => u.input.txHash),
    ).toEqual([built.txHash]);
  });

  it("builds two transactions from one builder holding a fee output", async () => {
    const service = baseAddress(3);
    const withFee = builder.add(
      output({
        label: "service fee",
        address: service,
        value: { lovelace: 1_000_000n },
      }),
    );
    const payTo = (n: number) =>
      output({
        label: "payment",
        address: baseAddress(n),
        value: { lovelace: 5_000_000n },
      });

    const first = await withFee.build(payTo(4), { payer: wallet });
    await submit(first);
    // The wallet is read again: what the first spent is not selected
    const second = await withFee.build(payTo(5), { payer: wallet });
    await submit(second);

    for (const [built, n] of [
      [first, 4],
      [second, 5],
    ] as const) {
      expect(built.outputs[0]).toMatchObject({
        label: "service fee",
        address: service,
      });
      expect(built.outputs[1]).toMatchObject({
        label: "payment",
        address: baseAddress(n),
      });
    }
    expect(emulator.utxos({ address: service })).toHaveLength(2);
  });
});
