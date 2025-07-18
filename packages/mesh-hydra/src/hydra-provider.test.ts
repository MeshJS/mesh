import { BlockfrostProvider, MeshTxBuilder, MeshWallet } from "@meshsdk/core";
import { HydraProvider } from "./hydra-provider";
import { HydraInstance } from "./hydra-instance";

describe("Hydra Provider", () => {
  it('should make and submit a valid tx', async () => {
    const provider = new HydraProvider({
      url: 'http://localhost:4001',
      wsUrl: 'ws://localhost:4001'
    });
    await provider.connect();
    await provider.init();

    const hInstance = new HydraInstance({
      provider: provider,
      fetcher: provider,
      submitter: provider
    })
    // const aliceWallet = {
    //   addr: 'addr_test1vp5cxztpc6hep9ds7fjgmle3l225tk8ske3rmwr9adu0m6qchmx5z',
    //   key: '58205f9b911a636479ed83ba601ccfcba0ab9a558269dc19fdea910d27e5cdbb5fc8',
    // };

    const seedPhrase = ["vibrant","north","decade","mean","ensure","turn","universe","cause","neutral","mad","can","next","mutual","tongue","main","bind","lizard","crumble","order","pole","assault","guilt","physical","cup"];
    const blockchainProvider = new BlockfrostProvider("preprodYAw21nxr9EdeZNSLDDLOJVg98DOrya75");
    const wallet = new MeshWallet({
      networkId: 0, // 0: testnet, 1: mainnet
      fetcher: blockchainProvider,
      submitter: blockchainProvider,
      key: {
        type: 'mnemonic',
        words: seedPhrase,
      },
    });
    //console.log(wallet);
    const address = wallet.addresses.baseAddressBech32!;

    console.log('address',address)
    
    //const addressTxIn = await provider.newTx();
    
    console.log(wallet);
    const pp = await provider.fetchProtocolParameters();
    const addressnew = wallet.getAddresses().enterpriseAddressBech32;
    //console.log(addressnew);
    //console.log('new address',addressnew);
    const utxos = await wallet.getUtxos('enterprise');
    console.log("utxos", utxos);

    const txBuilder = new MeshTxBuilder({
      fetcher: blockchainProvider,
      submitter: blockchainProvider,
      params: pp,
      verbose: true,
    });

    const unsignedTx = await txBuilder
    .txIn("b836770df71de7ecea2e9c975faf6fac136b134df6befde2d32c79e87cb297af",0)
    .txOut("addr_test1vp5cxztpc6hep9ds7fjgmle3l225tk8ske3rmwr9adu0m6qchmx5z", [{
      unit: 'lovelace',
      quantity: '10000000'
    }])
    .changeAddress("addr_test1qr6784s76cawztg7t7en4f79wfrf474zdyhkr5k07sv7uzdg6ske4tqzye89y4g46ht4wh7gruqpcldl942r0ned3flsgl7q4t")
    .complete();


    const signedTx = await wallet.signTx(unsignedTx);
    const success = await hInstance.commitBlueprint("b836770df71de7ecea2e9c975faf6fac136b134df6befde2d32c79e87cb297af",0,{
      type: "Tx ConwayEra",
      cborHex: signedTx,
      description: "A new blueprint tx",
    })
    console.log(`signedTx`, signedTx);
    provider.submitTx(signedTx);
    console.log("blueprintTx: ",success);
    const txHash = await provider.submitTx(signedTx);
    console.log(`txHash`, txHash);
    await provider.close()
    await provider.fanout()
  });
})
