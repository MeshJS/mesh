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
      httpUrl: "http://localhost:4001",
    });

    blockchainProvider = new BlockfrostProvider("");
    const seedPhrase = [""];

    hInstance = new HydraInstance({
      provider: provider,
      fetcher: blockchainProvider,
      submitter: blockchainProvider,
    });

    wallet = new MeshWallet({
      networkId: 0,
      fetcher: blockchainProvider,
      submitter: blockchainProvider,
      key: {
        type: "mnemonic",
        words: seedPhrase,
      },
    });
  });

  it("should make and submit a valid tx", async () => {
    await provider.connect();
    //await provider.init();

    const pp = await provider.fetchProtocolParameters();
    const utxos = await provider.fetchUTxOs();

    txBuilder = new MeshTxBuilder({
      fetcher: blockchainProvider,
      submitter: blockchainProvider,
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
      .setFee("0")
      .changeAddress("")
      .setNetwork("preprod")
      .complete();

    console.log(unsignedTx);

    const tx = await hInstance.commitBlueprint(
      "ad16a3a415763e8662469c868038a659f5076a174633323894666f4c9d2e60d1",
      1,
      {
        cborHex: unsignedTx,
        description: "a new blueprint tx",
        type: "Tx ConwayEra",
      },
    );
    console.log("tx", tx);
    const signedTx = await wallet.signTx(tx, true);
    const txHash = await wallet.submitTx(signedTx);
    console.log("commit txhash:", txHash);
    expect(typeof txHash).toBe("string");
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
  it("should close head appropriately", async () => {
    await provider.connect();
    await provider.close();
  });
});
