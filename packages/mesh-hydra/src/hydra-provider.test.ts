import { MeshTxBuilder, MeshWallet } from "@meshsdk/core";
import { HydraProvider } from "./hydra-provider";

describe("Hydra Provider", () => {
  it('should make and submit a valid tx', async () => {
    const provider = new HydraProvider({
      url: 'http://localhost:4001',
      wsUrl: 'ws://localhost:4001'
    });
    await provider.connect();
    await provider.init();

    const aliceWallet = {
      addr: 'addr_test1vp5cxztpc6hep9ds7fjgmle3l225tk8ske3rmwr9adu0m6qchmx5z',
      key: '58205f9b911a636479ed83ba601ccfcba0ab9a558269dc19fdea910d27e5cdbb5fc8',
    };

    const wallet = new MeshWallet({
      networkId: 0,
      key: {
        type: 'cli',
        payment: aliceWallet.key,
      },
      fetcher: provider,
      submitter: provider,
    });

    const pp = await provider.fetchProtocolParameters();
    const utxos = await wallet.getUtxos('enterprise');
    console.log("utxos", utxos);
    const changeAddress = aliceWallet.addr;

    const txBuilder = new MeshTxBuilder({
      fetcher: provider,
      params: pp,
      verbose: true,
    });

    const unsignedTx = await txBuilder
      .txOut(
        changeAddress,
        [{ unit: 'lovelace', quantity: '1000000' }],
      )
      .changeAddress(changeAddress)
      .selectUtxosFrom(utxos)
      .complete();

    const signedTx = await wallet.signTx(unsignedTx);
    console.log(`signedTx`, signedTx);
    const txHash = await wallet.submitTx(signedTx);
    console.log(`txHash`, txHash);
    await provider.close()
    await provider.fanout()
  });
})
