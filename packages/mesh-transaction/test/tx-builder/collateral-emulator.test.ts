import { CachedFetcher, mConStr0 } from "@meshsdk/core";
import { resolvePlutusScriptAddress } from "@meshsdk/core-cst";
import { ScalusEmulator } from "@meshsdk/scalus-emulator";
import { BrowserWallet, MeshWallet } from "@meshsdk/wallet";

import { OutputDatum, spend, TxBuilder, Utxo } from "../../src/tx-builder";
import { cip30Wallet } from "../cip30-wallet";
import { alwaysSucceedCbor } from "../test-util";
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
