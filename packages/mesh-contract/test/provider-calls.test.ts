import { MeshHelloWorldContract } from "@meshsdk/contract";
import { MeshTxBuilder, MeshWallet } from "@meshsdk/core";
import { ScalusEmulator } from "@meshsdk/scalus-emulator";

/** Wraps a provider so every method call is counted */
const countCalls = <T extends object>(target: T) => {
  const calls: Record<string, number> = {};
  const provider = new Proxy(target, {
    get(obj, prop) {
      const value = Reflect.get(obj, prop, obj);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        calls[String(prop)] = (calls[String(prop)] ?? 0) + 1;
        return value.apply(obj, args);
      };
    },
  });
  return { provider, calls };
};

describe("Contract provider calls", () => {
  it("hello world unlock fetches nothing the app or the wallet already has", async () => {
    const signer = new MeshWallet({
      networkId: 0,
      key: { type: "mnemonic", words: Array(24).fill("solution") },
    });
    await signer.init();
    const address = await signer.getChangeAddress();
    const emulator = await ScalusEmulator.create([
      {
        input: { txHash: "0".repeat(64), outputIndex: 0 },
        output: {
          address,
          amount: [{ unit: "lovelace", quantity: "10000000000" }],
        },
      },
      {
        input: { txHash: "1".repeat(64), outputIndex: 0 },
        output: {
          address,
          amount: [{ unit: "lovelace", quantity: "5000000" }],
        },
      },
    ]);
    const params = await emulator.fetchProtocolParameters();
    const { provider, calls } = countCalls(emulator);
    const wallet = new MeshWallet({
      networkId: 0,
      fetcher: provider,
      submitter: provider,
      key: { type: "mnemonic", words: Array(24).fill("solution") },
    });
    await wallet.init();
    // A fresh builder per transaction, as the contract does not reset it
    const contract = () =>
      new MeshHelloWorldContract({
        mesh: new MeshTxBuilder({
          fetcher: provider,
          submitter: provider,
          evaluator: provider,
          params,
        }),
        fetcher: provider,
        wallet,
        networkId: 0,
      });

    const lockTx = await contract().lockAsset([
      { unit: "lovelace", quantity: "10000000" },
    ]);
    const lockTxHash = await wallet.submitTx(await wallet.signTx(lockTx));
    for (const method of Object.keys(calls)) delete calls[method];

    const unlocker = contract();
    const scriptUtxo = await unlocker.getUtxoByTxHash(lockTxHash);
    const unlockTx = await unlocker.unlockAsset(scriptUtxo!, "Hello, World!");
    await wallet.submitTx(await wallet.signTx(unlockTx, true));

    // The app looks the locked UTxO up once; the builder reuses it
    expect(calls.fetchUTxOs).toBe(1);
    // Wallet UTxOs and collateral come from one request
    expect(calls.fetchAddressUTxOs).toBe(1);
    // Cost models were fetched for the lock tx, in the same epoch
    expect(calls.fetchCostModels).toBeUndefined();
    expect(calls.submitTx).toBe(1);
  });
});
