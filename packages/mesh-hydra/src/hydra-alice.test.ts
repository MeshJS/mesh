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
      url: "http://localhost:4001",
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

    const connectandcommit = async () => {
      
      await provider.connect();
      await provider.fanout();

      const tx = await hInstance.commitFunds(
        "31d851c3bb0aeba9507b3b9775be68a00991669fbe3591190294befe9e3a9b79",
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
        "addr_test1vr5r6y3wy09kd5tnr97azvq0klccc47uthve4s4phw7auvs0jyw3c"
      );
      console.log(aliceheadUtxo);

      const txbuilder = new MeshTxBuilder({
        fetcher: provider,
        submitter: provider,
        isHydra: true,
      });

      const unsignedTx = await txbuilder
        .txOut(
          "addr_test1vrlkv8dryg2lcmxjd8adpyd20vmnvwm8cjxv7fh6rpyve9qnmsq0l",
          [
            {
              unit: "lovelace",
              quantity: "50000000",
            },
          ]
        )
        .changeAddress(
          "addr_test1vr5r6y3wy09kd5tnr97azvq0klccc47uthve4s4phw7auvs0jyw3c"
        )
        .setNetwork("preprod")
        .selectUtxosFrom(aliceheadUtxo)
        .complete();

      const signedTx = await wallet.signTx(unsignedTx);
      const txHash = await provider.submitTx(signedTx);
      console.log(txHash);
    };

    await connectandcommit();
    await headNewTx();
  });
});
