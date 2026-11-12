import { CachedFetcher, UTxO } from "@meshsdk/core";
import { ScalusEmulator } from "@meshsdk/scalus-emulator";
import { BrowserWallet, MeshWallet } from "@meshsdk/wallet";

import { BuiltTx, output, Payer, TxBuilder } from "../../src/tx-builder";
import { cip30Wallet } from "../cip30-wallet";
import { baseAddress } from "../test-util";

const words = Array(24).fill("solution");
const recipient = baseAddress(2);

/*
 * Payments built from a payer in each of its forms, signed by the wallet and submitted to the
 * emulator, whose ledger checks that the UTxOs read are the wallet's and unspent.
 */
describe("TxBuilder payers on the emulator", () => {
  let emulator: ScalusEmulator;
  let builder: TxBuilder;
  let address: string;
  /** The fixture's wallet, reading through the emulator without the short-lived cache */
  let wallet: MeshWallet;

  const pay = () =>
    output({ address: recipient, value: { lovelace: 5_000_000n } });
  const submit = async (built: BuiltTx) => {
    const txHash = await emulator.submitTx(await wallet.signTx(built.tx));
    expect(txHash).toBe(built.txHash);
  };

  beforeEach(async () => {
    const reader = new MeshWallet({
      networkId: 0,
      key: { type: "mnemonic", words },
    });
    await reader.init();
    address = (await reader.getChangeAddress())!;
    emulator = await ScalusEmulator.create(
      [0, 1].map((i): UTxO => ({
        input: { txHash: "0".repeat(64), outputIndex: i },
        output: {
          address,
          amount: [{ unit: "lovelace", quantity: "100000000000" }],
        },
      })),
    );
    wallet = new MeshWallet({
      networkId: 0,
      key: { type: "mnemonic", words },
      fetcher: new CachedFetcher(emulator, { volatileTtlMs: 0 }),
    });
    await wallet.init();
    builder = new TxBuilder({ network: "preview", provider: emulator });
  });

  it("reads a wallet made without a fetcher through the provider", async () => {
    const noFetcher = new MeshWallet({
      networkId: 0,
      key: { type: "mnemonic", words },
    });
    await noFetcher.init();
    const built = await builder.build(pay(), { payer: noFetcher });
    expect(built.change.map((o) => o.address)).toEqual([address]);
    const txHash = await emulator.submitTx(await noFetcher.signTx(built.tx));
    expect(txHash).toBe(built.txHash);
  });

  it("pays from one wallet in each form of payer", async () => {
    const api = await cip30Wallet({
      words,
      fetcher: new CachedFetcher(emulator, { volatileTtlMs: 0 }),
    });
    const payers: (() => Promise<Payer>)[] = [
      async () => wallet,
      async () => api,
      async () => address,
      () => builder.readPayer(api),
    ];
    for (const payer of payers) {
      const built = await builder.build(pay(), { payer: await payer() });
      expect(built.change.map((o) => o.address)).toEqual([address]);
      // The CIP-30 api answers with its witnesses only
      const witnesses = await api.signTx(built.tx, false);
      const tx = BrowserWallet.addBrowserWitnesses(built.tx, witnesses);
      expect(await emulator.submitTx(tx)).toBe(built.txHash);
    }
  });

  it("builds a second payment from an address right after the first, reading it anew", async () => {
    const first = await builder.build(pay(), { payer: address });
    await submit(first);
    const second = await builder.build(pay(), { payer: address });
    await submit(second);
    const spent = new Set(
      first.inputs.map((u) => `${u.input.txHash}#${u.input.outputIndex}`),
    );
    for (const input of second.inputs)
      expect(
        spent.has(`${input.input.txHash}#${input.input.outputIndex}`),
      ).toBe(false);
  });
});
