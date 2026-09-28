import {
  IEvaluator,
  IFetcher,
  mConStr0,
  NativeScript,
  resolveNativeScriptAddress,
  resolveScriptRef,
  UTxO,
} from "@meshsdk/core";
import {
  OfflineEvaluatorScalus,
  resolvePlutusScriptAddress,
  Serialization,
} from "@meshsdk/core-cst";
import { ScalusEmulator } from "@meshsdk/scalus-emulator";
import { MeshTxBuilder } from "@meshsdk/transaction";
import { MeshWallet } from "@meshsdk/wallet";

import { alwaysSucceedCbor, alwaysSucceedHash } from "../test-util";

/**
 * Wraps a provider so every method call is recorded, both in total and per first argument
 * (the tx hash, for `fetchUTxOs`).
 */
const recordCalls = <T extends object>(target: T) => {
  const calls: Record<string, string[]> = {};
  const provider = new Proxy(target, {
    get(obj, prop) {
      const value = Reflect.get(obj, prop, obj);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        (calls[String(prop)] ??= []).push(String(args[0]));
        return value.apply(obj, args);
      };
    },
  });
  const count = (method: string) => calls[method]?.length ?? 0;
  const countFor = (method: string, arg: string) =>
    calls[method]?.filter((a) => a === arg).length ?? 0;
  const args = (method: string) => calls[method] ?? [];
  return { provider, count, countFor, args };
};

const lovelace = (quantity: string) => [{ unit: "lovelace", quantity }];

const scriptAddress = resolvePlutusScriptAddress(
  {
    code: alwaysSucceedCbor,
    version: "V3",
  },
  0,
);
const scriptTxHash = "2".repeat(64);
const refScriptTxHash = "3".repeat(64);
const unitDatum = Serialization.PlutusData.fromCore({
  constructor: 0n,
  fields: { items: [] },
}).toCbor();

async function setup(extraUtxos: (address: string) => UTxO[] = () => []) {
  const wallet = new MeshWallet({
    networkId: 0,
    key: { type: "mnemonic", words: Array(24).fill("solution") },
  });
  await wallet.init();
  const address = (await wallet.getChangeAddress())!;
  const emulator = await ScalusEmulator.create([
    {
      input: { txHash: "0".repeat(64), outputIndex: 0 },
      output: { address, amount: lovelace("10000000000") },
    },
    {
      input: { txHash: "1".repeat(64), outputIndex: 0 },
      output: { address, amount: lovelace("5000000") },
    },
    ...extraUtxos(address),
  ]);
  const params = await emulator.fetchProtocolParameters();
  const walletUtxos = await emulator.fetchAddressUTxOs(address);
  const collateral = walletUtxos.find(
    (utxo) => utxo.input.txHash === "1".repeat(64),
  )!;
  const utxos = walletUtxos.filter((utxo) => utxo !== collateral);
  return { wallet, address, emulator, params, utxos, collateral };
}

const lockedScriptUtxos = (count: number): UTxO[] =>
  Array.from({ length: count }, (_, outputIndex) => ({
    input: { txHash: scriptTxHash, outputIndex },
    output: {
      address: scriptAddress,
      amount: lovelace("20000000"),
      plutusData: unitDatum,
    },
  }));

describe("MeshTxBuilder provider calls", () => {
  it("does not evaluate a transaction without Plutus scripts", async () => {
    const { wallet, address, emulator, params, utxos } = await setup();
    const { provider, count } = recordCalls(emulator);

    const txHex = await new MeshTxBuilder({
      fetcher: provider,
      evaluator: provider,
      params,
    })
      .txOut(address, lovelace("2000000"))
      .changeAddress(address)
      .selectUtxosFrom(utxos)
      .complete();

    expect(count("evaluateTx")).toBe(0);
    expect(count("fetchUTxOs")).toBe(0);
    expect(count("fetchCostModels")).toBe(1);
    expect(await emulator.submitTx(await wallet.signTx(txHex))).toHaveLength(
      64,
    );
  });

  it("fetches each transaction once for inputs given by reference only", async () => {
    const { wallet, address, emulator, params, utxos, collateral } =
      await setup(() => lockedScriptUtxos(3));
    const { provider, count, countFor } = recordCalls(emulator);

    const txBuilder = new MeshTxBuilder({
      fetcher: provider,
      evaluator: provider,
      params,
    });
    for (let i = 0; i < 3; i++) {
      txBuilder
        .spendingPlutusScriptV3()
        .txIn(scriptTxHash, i)
        .txInInlineDatumPresent()
        .txInRedeemerValue(mConStr0([]))
        .txInScript(alwaysSucceedCbor);
    }
    const txHex = await txBuilder
      .txInCollateral(
        collateral.input.txHash,
        collateral.input.outputIndex,
        collateral.output.amount,
        collateral.output.address,
      )
      .changeAddress(address)
      .selectUtxosFrom(utxos)
      .complete();

    expect(countFor("fetchUTxOs", scriptTxHash)).toBe(1);
    expect(count("fetchUTxOs")).toBe(1);
    expect(await emulator.submitTx(await wallet.signTx(txHex))).toHaveLength(
      64,
    );
  });

  it("completes a reference script source whose UTxO lacks a script hash", async () => {
    const { wallet, address, emulator, params, utxos, collateral } =
      await setup(() => [
        ...lockedScriptUtxos(1),
        {
          input: { txHash: refScriptTxHash, outputIndex: 0 },
          output: {
            address: scriptAddress,
            amount: lovelace("5000000"),
            scriptRef: resolveScriptRef({
              code: alwaysSucceedCbor,
              version: "V3",
            }),
          },
        },
      ]);
    const { provider, count } = recordCalls(emulator);

    const txBuilder = new MeshTxBuilder({
      fetcher: provider,
      evaluator: provider,
      params,
    });
    const txHex = await txBuilder
      .spendingPlutusScriptV3()
      .txIn(scriptTxHash, 0)
      .txInInlineDatumPresent()
      .txInRedeemerValue(mConStr0([]))
      .spendingTxInReference(refScriptTxHash, 0)
      .txInCollateral(
        collateral.input.txHash,
        collateral.input.outputIndex,
        collateral.output.amount,
        collateral.output.address,
      )
      .changeAddress(address)
      .selectUtxosFrom(utxos)
      .complete();

    expect(count("fetchUTxOs")).toBe(2);
    const [scriptInput] = txBuilder.meshTxBuilderBody.inputs;
    expect(
      scriptInput?.type === "Script" &&
        scriptInput.scriptTxIn.scriptSource?.type === "Inline" &&
        scriptInput.scriptTxIn.scriptSource.scriptHash,
    ).toBe(alwaysSucceedHash);
    expect(await emulator.submitTx(await wallet.signTx(txHex))).toHaveLength(
      64,
    );
  });

  it("completes a native reference script source from the fetcher", async () => {
    const nativeScript: NativeScript = { type: "all", scripts: [] };
    const { address, emulator, params, utxos } = await setup(() => [
      {
        input: { txHash: scriptTxHash, outputIndex: 0 },
        output: {
          address: resolveNativeScriptAddress(nativeScript, 0),
          amount: lovelace("20000000"),
        },
      },
      {
        input: { txHash: refScriptTxHash, outputIndex: 0 },
        output: {
          address: scriptAddress,
          amount: lovelace("2000000"),
          scriptRef: resolveScriptRef(nativeScript),
        },
      },
    ]);
    const { provider, count } = recordCalls(emulator);

    const txHex = await new MeshTxBuilder({
      fetcher: provider,
      evaluator: provider,
      params,
    })
      .txIn(scriptTxHash, 0)
      .simpleScriptTxInReference(refScriptTxHash, 0)
      .changeAddress(address)
      .selectUtxosFrom(utxos)
      .complete();

    expect(count("fetchUTxOs")).toBe(2);
    // The script needs no signature, and no wallet input is selected
    expect(await emulator.submitTx(txHex)).toHaveLength(64);
  });

  it("resolves inputs from a chained transaction without fetching", async () => {
    const { wallet, address, emulator, params, utxos } = await setup();
    const { provider, count } = recordCalls(emulator);

    const parentTx = await wallet.signTx(
      await new MeshTxBuilder({ fetcher: provider, params })
        .txOut(address, lovelace("30000000"))
        .changeAddress(address)
        .selectUtxosFrom(utxos)
        .complete(),
    );
    const parentHash = Serialization.Transaction.fromCbor(
      Serialization.TxCBOR(parentTx),
    )
      .getId()
      .toString();

    const childTx = await new MeshTxBuilder({
      fetcher: provider,
      evaluator: provider,
      params,
    })
      .txIn(parentHash, 0)
      .txOut(address, lovelace("10000000"))
      .changeAddress(address)
      .chainTx(parentTx)
      .complete();

    expect(count("fetchUTxOs")).toBe(0);
    expect(await emulator.submitTx(parentTx)).toBe(parentHash);
    expect(await emulator.submitTx(await wallet.signTx(childTx))).toHaveLength(
      64,
    );
  });

  it("offline evaluator fetches each transaction once across evaluations", async () => {
    const { address, emulator, params, utxos, collateral } = await setup(() =>
      lockedScriptUtxos(1),
    );
    const evaluatorFetcher = recordCalls<IFetcher>(emulator);
    const evaluator: IEvaluator = new OfflineEvaluatorScalus(
      evaluatorFetcher.provider,
      "preview",
    );
    const builderEvaluator = recordCalls(evaluator);

    const build = () =>
      new MeshTxBuilder({
        fetcher: emulator,
        evaluator: builderEvaluator.provider,
        params,
      })
        .spendingPlutusScriptV3()
        .txIn(scriptTxHash, 0)
        .txInInlineDatumPresent()
        .txInRedeemerValue(mConStr0([]))
        .txInScript(alwaysSucceedCbor)
        .txInCollateral(
          collateral.input.txHash,
          collateral.input.outputIndex,
          collateral.output.amount,
          collateral.output.address,
        )
        .changeAddress(address)
        .selectUtxosFrom(utxos)
        .complete();
    await build();
    // A second build with the same evaluator needs nothing new from the fetcher
    await build();

    expect(builderEvaluator.count("evaluateTx")).toBeGreaterThanOrEqual(2);
    const fetchedTxHashes = evaluatorFetcher.args("fetchUTxOs");
    expect(fetchedTxHashes).toContain(scriptTxHash);
    expect(fetchedTxHashes).toContain(collateral.input.txHash);
    expect(new Set(fetchedTxHashes).size).toBe(fetchedTxHashes.length);
  });
});
