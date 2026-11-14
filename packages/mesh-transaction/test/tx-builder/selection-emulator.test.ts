import { CachedFetcher, UTxO } from "@meshsdk/core";
import { ScalusEmulator } from "@meshsdk/scalus-emulator";
import { MeshWallet } from "@meshsdk/wallet";

import {
  Assets,
  BuiltTxData,
  output,
  toUtxo,
  TxBuilder,
  Utxo,
  UtxoInput,
} from "../../src/tx-builder";
import { valueSize } from "../../src/tx-builder/fee";
import { fromAssets, toValuePrototype } from "../../src/tx-builder/value";
import { baseAddress } from "../test-util";
import { asMesh } from "./utxo-util";

const words = Array(24).fill("solution");
const recipient = baseAddress(2);
const vault = baseAddress(3);
const policy = "ab".repeat(28);
/** A token unit with a 32-byte name */
const unit = (n: number) => policy + n.toString(16).padStart(64, "0");
const outRef = (u: UTxO | Utxo) => {
  const { txHash, outputIndex } = "input" in u ? u.input : u;
  return `${txHash}#${outputIndex}`;
};

/*
 * Selection options on the emulator, whose ledger checks that what was selected is the wallet's
 * and unspent, and that every output is within the network's limits.
 */
describe("TxBuilder selection on the emulator", () => {
  let emulator: ScalusEmulator;
  let builder: TxBuilder;
  let wallet: MeshWallet;
  let address: string;

  /** An emulator holding the wallet's UTxOs with these values */
  const start = async (values: Assets[]) => {
    const reader = new MeshWallet({
      networkId: 0,
      key: { type: "mnemonic", words },
    });
    await reader.init();
    address = (await reader.getChangeAddress())!;
    emulator = await ScalusEmulator.create(
      values
        .map((value, i): Utxo => ({
          txHash: "0".repeat(64),
          outputIndex: i,
          address,
          value,
        }))
        .map(asMesh),
    );
    wallet = new MeshWallet({
      networkId: 0,
      key: { type: "mnemonic", words },
      fetcher: new CachedFetcher(emulator, { volatileTtlMs: 0 }),
    });
    await wallet.init();
    builder = new TxBuilder({ network: "preview", provider: emulator });
  };
  const submit = async (built: BuiltTxData) => {
    const txHash = await emulator.submitTx(await wallet.signTx(built.tx));
    expect(txHash).toBe(built.txHash);
  };

  it("sweeps a wallet whose tokens do not fit in one output", async () => {
    // 180 tokens with 32-byte names: more than the 5000 bytes of value an output may hold
    await start(
      [0, 1, 2].map((k) => ({
        lovelace: 50_000_000n,
        ...Object.fromEntries(
          Array.from({ length: 60 }, (_, i) => [unit(k * 60 + i), 1n]),
        ),
      })),
    );
    const { maxValSize } = (await builder.chain()).params;
    const built = await builder.build([], { payer: wallet, sendAllTo: vault });
    await submit(built);

    expect(await emulator.fetchAddressUTxOs(address)).toEqual([]);
    const held = await emulator.fetchAddressUTxOs(vault);
    expect(held.length).toBeGreaterThan(1);
    for (const u of held)
      expect(
        valueSize(toValuePrototype(fromAssets(u.output.amount))),
      ).toBeLessThanOrEqual(maxValSize);
    const units = held.flatMap((u) =>
      u.output.amount.filter((a) => a.unit !== "lovelace").map((a) => a.unit),
    );
    expect(units.sort()).toEqual(
      Array.from({ length: 180 }, (_, i) => unit(i)).sort(),
    );
  });

  it("pays without spending the UTxO holding a protected token", async () => {
    const guarded = unit(1);
    await start([
      { lovelace: 1_000_000_000n, [guarded]: 1n },
      { lovelace: 50_000_000n, [unit(2)]: 5n },
    ]);
    const pay = output({ address: recipient, value: { lovelace: 5_000_000n } });
    const holding = (u: UtxoInput) => toUtxo(u).value[guarded] !== undefined;
    // Without the filter the largest UTxO is taken, the guarded one
    const unfiltered = await builder.build(pay, { payer: wallet });
    expect(unfiltered.selectedInputs.some(holding)).toBe(true);

    const built = await builder.build(pay, {
      payer: wallet,
      canSelect: (u) => !holding(u),
    });
    expect(built.inputs.some(holding)).toBe(false);
    await submit(built);
    const left = await emulator.fetchAddressUTxOs(address);
    const kept = left.filter(holding);
    expect(kept.map(outRef)).toEqual([`${"0".repeat(64)}#0`]);
  });
});
