import type { NextPage } from "next";

import {
  BrowserWallet,
  // BlockstreamProvider,
  // BrowserWallet,
  // EmbeddedWallet,
  // MaestroProvider,
  Network,
} from "@meshsdk/bitcoin";

import Button from "~/components/button/button";
import Metatags from "~/components/site/metatags";

// https://mempool.space/testnet4/address/tb1q3x7c8nuew6ayzmy3fnfx6ydnr8a4kf2267za7y
const testingAddress = "tb1q3x7c8nuew6ayzmy3fnfx6ydnr8a4kf2267za7y";

const ReactPage: NextPage = () => {
  // async function loadEmbeddedWallet() {
  //   const provider = new BlockstreamProvider(Network.Testnet);

  //   const mnemonic =
  //     "birth cannon between under split jewel slow love sugar camera dignity excess";

  //   const wallet = new EmbeddedWallet({
  //     testnet: false,
  //     key: {
  //       type: "mnemonic",
  //       words: mnemonic.split(" "),
  //     },
  //     provider: provider,
  //   });

  //   const address = wallet.getAddress();
  //   console.log("address", address);
  //   console.log("expectAddress", testingAddress === address.address);
  //   console.log("network", wallet.getNetworkId());
  //   console.log("publicKey", wallet.getPublicKey());
  //   // console.log("utxos", await wallet.getUtxos());

  //   // console.log("brew", EmbeddedWallet.brew());
  // }

  async function loadBrowserWallet() {
    const wallet = await BrowserWallet.enable("Mesh SDK want to connect");

    console.log("request getBalance", await wallet.getBalance());
    console.log("request getAddresses", await wallet.getAddresses());
    console.log("request getChangeAddress", await wallet.getChangeAddress());
    console.log("request getNetworkId", await wallet.getNetworkId());
    console.log("request getUTXOs", await wallet.getUTXOs());
    // console.log("request signData", await wallet.signData('test message'));
  }

  // async function blockstream() {
  //   console.log("blockstream");

  //   const provider = new BlockstreamProvider(Network.Testnet);

  //   const fetchAddressTransactions =
  //     await provider.fetchAddressTransactions(testingAddress);
  //   console.log("fetchAddressTransactions", fetchAddressTransactions);

  //   const utxos = await provider.fetchAddressUTxOs(testingAddress);
  //   console.log("utxos", utxos);
  // }

  // async function maestro() {
  //   const provider = new MaestroProvider(
  //     Network.Testnet,
  //     process.env.NEXT_PUBLIC_MAESTRO_API_KEY_MAINNET_BITCOIN_TESTNET!,
  //   );

  //   // const utxos = await provider.fetchAddressUTxOs(testingAddress);
  //   // console.log("utxos", utxos);

  //   // console.log("fetchAddress", await provider.fetchAddress(testingAddress));
  //   console.log(
  //     "fetchAddressTransactions",
  //     await provider.fetchAddressTransactions(testingAddress),
  //   );
  //   console.log(
  //     "fetchAddressUTxOs",
  //     await provider.fetchAddressUTxOs(testingAddress),
  //   );
  //   // console.log("fetchScript", await provider.fetchScript());
  //   // console.log("fetchScriptTransactions", await provider.fetchScriptTransactions());
  //   // console.log("fetchScriptUTxOs", await provider.fetchScriptUTxOs());
  //   // console.log("fetchTransactionStatus", await provider.fetchTransactionStatus());
  // }

  return (
    <>
      <Metatags title={"Bitcoin"} description={"Building in progress"} />
      {/* <Button onClick={() => loadEmbeddedWallet()}>loadEmbeddedWallet</Button>
      <Button onClick={() => loadBrowserWallet()}>loadBrowserWallet</Button>

      <Button onClick={() => blockstream()}>blockstream</Button>
      <Button onClick={() => maestro()}>maestro</Button> */}

      <Button onClick={() => loadBrowserWallet()}>browserWallet</Button>
    </>
  );
};

export default ReactPage;
