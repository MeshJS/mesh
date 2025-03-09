import { MeshTxBuilder, MeshWallet } from "@meshsdk/core";
import { HydraProvider } from "@meshsdk/hydra";

import Button from "~/components/button/button";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function HydraInitializeHead({
  provider,
  providerName,
}: {
  provider: HydraProvider;
  providerName: string;
}) {
  return (
    <TwoColumnsScroll
      sidebarTo="initHead"
      title="Initializes a new Hydra Head"
      leftSection={Left()}
      rightSection={Right(provider, providerName)}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        Initializes a new Head. This command is a no-op when a Head is already
        open and the server will output an <code>CommandFailed</code> message
        should this happen.
      </p>
      <Codeblock data={`await provider.init();`} />
    </>
  );
}

function Right(provider: HydraProvider, providerName: string) {
  async function runDemo() {
    provider.onMessage((message) => {
      console.log("Hydra onMessage", message);
      if (message.tag === "Greetings") {
        console.log("Greetings", JSON.stringify(message));
      }
    });
    provider.onStatusChange((status) => {
      console.log("Hydra status", status);
    });

    // await provider.connect();
    await provider.init();
  }

  // async function fetchutxo() {
  //   const utxos = await provider.fetchUTxOs();
  //   console.log("UTXOs: ", utxos);
  //   const utxosAddress = await provider.fetchAddressUTxOs(
  //     "addr_test1vpd5axpq4qsh8sxvzny49cp22gc5tqx0djf6wmjv5cx7q5qyrzuw8",
  //   );
  //   console.log("UTXOs Address: ", utxosAddress);
  // }

  // async function fetchpp() {
  //   const pp = await provider.fetchProtocolParameters();
  //   console.log("pp: ", pp);
  // }

  // async function maketx() {
  //   // wallet
  //   const walletA = {
  //     addr: "addr_test1vpsthwvxgfkkm2lm8ggy0c5345u6vrfctmug6tdyx4rf4mqn2xcyw",
  //     key: "58201aae63d93899640e91b51c5e8bd542262df3ecf3246c3854f39c40f4eb83557d",
  //   };

  //   const wallet = new MeshWallet({
  //     networkId: 0,
  //     key: {
  //       type: "cli",
  //       payment: walletA.key,
  //     },
  //     fetcher: provider,
  //     submitter: provider,
  //   });
  //   await wallet.init();

  //   const pp = await provider.fetchProtocolParameters();
  //   // const utxos = await provider.fetchAddressUTxOs(walletA.addr);
  //   // console.log("utxos", utxos);
  //   const utxos = await wallet.getUtxos("enterprise");
  //   // console.log("utxos", utxos);
  //   const changeAddress = walletA.addr;
  //   console.log(11, changeAddress)
  //   console.log(222, await wallet.getChangeAddress("enterprise"))

  //   const txBuilder = new MeshTxBuilder({
  //     fetcher: provider,
  //     params: pp,
  //     verbose: true,
  //   });

  //   const unsignedTx = await txBuilder
  //     .txOut(
  //       "addr_test1vpd5axpq4qsh8sxvzny49cp22gc5tqx0djf6wmjv5cx7q5qyrzuw8",
  //       [{ unit: "lovelace", quantity: "3000000" }],
  //     )
  //     .changeAddress(changeAddress)
  //     .selectUtxosFrom(utxos)
  //     .complete();

  //   const signedTx = await wallet.signTx(unsignedTx);
  //   // const txHash = await provider.submitTx(signedTx);
  //   const txHash = await wallet.submitTx(signedTx);
  //   console.log("txHash", txHash);
  // }

  return (
    <LiveCodeDemo
      title="Initializes Hydra Head"
      subtitle="Initializes a new Head."
      runCodeFunction={runDemo}
      runDemoShowProviderInit={true}
      runDemoProvider={providerName}
    >
      {/* <Button onClick={fetchutxo}>fetchutxo</Button>
      <Button onClick={fetchpp}>fetchpp</Button>
       */}
       {/* <Button onClick={maketx}>maketx</Button> */}
    </LiveCodeDemo>
  );
}
