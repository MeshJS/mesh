import {
  BlockfrostProvider,
  MeshTxBuilder,
  MeshWallet,
} from "@meshsdk/core";
import { HydraProvider } from "./hydra-provider";
import { HydraInstance } from "./hydra-instance";

describe("Hydra Provider", () => {
  it("should make and submit a valid tx", async () => {
    const provider = new HydraProvider({
      url: "http://localhost:4002",
      history: true,
    });

    const blockchainProvider = new BlockfrostProvider(
      ""
    );

    const hInstance = new HydraInstance({
      provider: provider,
      fetcher: blockchainProvider,
      submitter: blockchainProvider,
    });

    const wallet = new MeshWallet({
      networkId: 0, // 0: testnet, 1: mainnet
      fetcher: blockchainProvider,
      submitter: blockchainProvider,
      key: {
        type: "cli",
        payment:
        "",
      },
    });

    const connect_and_commit = async () => {
      
      await provider.connect();
      await provider.fanout();

      const tx = await hInstance.commitFunds(
        "a04daa261911c9cc27b69f43166f989515ff3e4d141da0fba62526acd327b866",
        0
      );

      const signedTx = await wallet.signTx(tx, true);
      const txHash = await wallet.submitTx(signedTx);
      console.log("commited hash", txHash);
    };

    const headNewTx = async () => {
      await provider.connect();
      const utxo = provider.fetchUTxOs();
      if (!utxo) {
        console.log("unable to get latest head snapshot utxo");
      }
      console.log(utxo);

      const aliceheadUtxo = await provider.fetchAddressUTxOs(
        "addr_test1vrlkv8dryg2lcmxjd8adpyd20vmnvwm8cjxv7fh6rpyve9qnmsq0l"
      );
      console.log(aliceheadUtxo);

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
              quantity: "30000000",
            },
          ]
        )
        .changeAddress(
          "addr_test1vrlkv8dryg2lcmxjd8adpyd20vmnvwm8cjxv7fh6rpyve9qnmsq0l"
        )
        .setNetwork("preprod")
        .selectUtxosFrom(aliceheadUtxo)
        .complete();

      const signedTx = await wallet.signTx(unsignedTx);
      const txHash = await provider.submitTx(signedTx);
      console.log(txHash);
    };

    await connect_and_commit();
    await headNewTx();
  });
});
