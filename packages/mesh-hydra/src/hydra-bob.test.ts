import { BlockfrostProvider, MeshTxBuilder, MeshWallet } from "@meshsdk/core";

import { HydraInstance } from "./hydra-instance";
import { HydraProvider } from "./hydra-provider";

describe("Hydra Provider", () => {
  let provider: HydraProvider;
  let blockchainProvider: BlockfrostProvider;
  let hInstance: HydraInstance;
  let wallet: MeshWallet;
  let txBuilder: MeshTxBuilder;

  beforeEach(() => {
    provider = new HydraProvider({
      httpUrl: "http://localhost:4002",
    });

    blockchainProvider = new BlockfrostProvider("");

    hInstance = new HydraInstance({
      provider: provider,
      fetcher: blockchainProvider,
      submitter: blockchainProvider,
    });

    wallet = new MeshWallet({
      networkId: 0,
      fetcher: provider,
      submitter: provider,
      key: {
        type: "mnemonic",
        words: [],
      },
    });
  });

  it("should make and submit a valid tx", async () => {
    await provider.connect();
    //await provider.init();

    const pp = await provider.fetchProtocolParameters();
    const utxos = await wallet.getUtxos();

    txBuilder = new MeshTxBuilder({
      fetcher: provider,
      submitter: provider,
      params: pp,
      isHydra: true,
    });
    const unsignedTx = await txBuilder
      .txIn(
        "cd8d9b66df467df82cf6df10a0dbd24847a27ac280e1033e509a8bc0de8d2579",
        2,
      )
      .txOut("", [
        {
          unit: "lovelace",
          quantity: "30000000",
        },
      ])
      .selectUtxosFrom(utxos)
      .changeAddress("")
      .setNetwork("preprod")
      .complete();

    const signedTx = await wallet.signTx(unsignedTx, true);
    const txHash = await wallet.submitTx(signedTx);
    console.log("commit txhash:", txHash);
    expect(typeof txHash).toBe("string");
  });

  it("should fetch UTXOs and build a transaction", async () => {
    await provider.connect();
    const utxo = await provider.fetchUTxOs();
    expect(utxo).toBeDefined();

    const aliceheadUtxo = await provider.fetchAddressUTxOs(
      "addr_test1vrlkv8dryg2lcmxjd8adpyd20vmnvwm8cjxv7fh6rpyve9qnmsq0l",
    );
    expect(aliceheadUtxo).toBeDefined();

    const txbuilder = new MeshTxBuilder({
      fetcher: provider,
      submitter: provider,
      isHydra: true,
    });

    const unsignedTx = await txbuilder
      .txOut(
        "addr_test1vr5r6y3wy09kd5tnr97azvq0klccc47uthve4s4phw7auvs0jyw3c",
        [
          {
            unit: "lovelace",
            quantity: "50000000",
          },
        ],
      )
      .changeAddress(
        "addr_test1vrlkv8dryg2lcmxjd8adpyd20vmnvwm8cjxv7fh6rpyve9qnmsq0l",
      )
      .setNetwork("preprod")
      .selectUtxosFrom(aliceheadUtxo)
      .complete();

    expect(unsignedTx).toBeDefined();

    const signedTx = await wallet.signTx(unsignedTx);
    await provider.submitTx(signedTx);
  });

  it("should fail to fetch UTXOs for an invalid address", async () => {
    await provider.connect();
    await expect(
      provider.fetchAddressUTxOs("invalid_address"),
    ).rejects.toThrow();
  });

  it("should throw error when submitting an invalid transaction", async () => {
    await provider.connect();
    await expect(provider.submitTx("invalid_tx")).rejects.toThrow();
  });
});
