import { mConStr0 } from "@meshsdk/core";
import { resolvePlutusScriptAddress } from "@meshsdk/core-cst";
import { ScalusEmulator } from "@meshsdk/scalus-emulator";
import { MeshWallet } from "@meshsdk/wallet";

import {
  Assets,
  BuiltTx,
  output,
  OutputDatum,
  spend,
  TxBuilder,
  Utxo,
} from "../../src/tx-builder";
import { alwaysSucceedCbor } from "../test-util";
import { asMesh } from "./utxo-util";

const plutusScript = { code: alwaysSucceedCbor, version: "V3" as const };
// A blueprint's compiled code: the program in a single CBOR wrapping
const blueprintScript = {
  code: alwaysSucceedCbor.slice(4),
  version: "V3" as const,
};
const lovelace = (quantity: bigint): Assets => ({ lovelace: quantity });
const unitInline: OutputDatum = {
  type: "inline",
  data: { type: "CBOR", content: "d87980" },
};
const fundsHash = "0".repeat(64);
const lockedHash = "2".repeat(64);
// Enough for the always-succeeding script, stated so that no evaluator is needed
const units = { mem: 100_000, steps: 100_000_000 };

/*
 * Builders configured from their network and a snapshot of the chain, and the addresses they
 * work out, checked by the emulator's ledger, a preview one.
 */
describe("TxBuilder's network and chain on the emulator", () => {
  let provider: ScalusEmulator;
  let wallet: MeshWallet;
  let address: string;
  let locked: Utxo;

  const submit = async (built: BuiltTx) =>
    expect(await provider.submitTx(await wallet.signTx(built.tx))).toBe(
      built.txHash,
    );

  beforeEach(async () => {
    wallet = new MeshWallet({
      networkId: 0,
      key: { type: "mnemonic", words: Array(24).fill("solution") },
    });
    await wallet.init();
    address = (await wallet.getChangeAddress())!;
    locked = {
      txHash: lockedHash,
      outputIndex: 0,
      address: resolvePlutusScriptAddress(plutusScript, 0),
      value: lovelace(20_000_000n),
      datum: unitInline,
    };
    provider = await ScalusEmulator.create(
      [
        {
          txHash: fundsHash,
          outputIndex: 0,
          address,
          value: lovelace(10_000_000_000n),
        },
        locked,
      ].map(asMesh),
    );
  });

  it("builds the same transaction from a snapshot of the chain, without a provider", async () => {
    const live = new TxBuilder({
      network: "preview",
      provider,
      evaluator: null,
    });
    const snapshot = await live.chain();
    const fromSnapshot = new TxBuilder({ ...snapshot, evaluator: null });
    expect(fromSnapshot.provider).toBeUndefined();

    const parts = [
      spend.plutus({
        utxo: locked,
        script: plutusScript,
        redeemer: { data: mConStr0([]), exUnits: units },
      }),
    ];
    const options = {
      payer: {
        changeAddress: address,
        utxos: await provider.fetchAddressUTxOs(address),
      },
    };
    const built = await fromSnapshot.build(parts, options);
    expect(built.tx).toBe((await live.build(parts, options)).tx);
    await submit(built);
  });

  it("unlocks what it locks at the script address it gives", async () => {
    const builder = new TxBuilder({ network: "preview", provider });
    const scriptAddress = builder.scriptAddress(blueprintScript);
    const lock = await builder.build(
      [
        output({
          address: scriptAddress,
          value: { lovelace: 15_000_000n },
          datum: { type: "inline", data: mConStr0([]) },
        }),
      ],
      {
        payer: {
          changeAddress: address,
          utxos: await provider.fetchAddressUTxOs(address),
        },
      },
    );
    await submit(lock);

    const [lockedHere] = (await provider.fetchUTxOs(lock.txHash)).filter(
      (utxo) => utxo.output.address === scriptAddress,
    );
    expect(lockedHere).toBeDefined();
    const unlock = await builder.build(
      [
        spend.plutus({
          utxo: lockedHere!,
          script: blueprintScript,
          redeemer: { data: mConStr0([]) },
        }),
      ],
      {
        payer: {
          changeAddress: address,
          utxos: await provider.fetchAddressUTxOs(address),
        },
      },
    );
    await submit(unlock);
  });
});
