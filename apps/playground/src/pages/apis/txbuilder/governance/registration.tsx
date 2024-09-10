import { hashDrepAnchor, keepRelevant, Quantity, Unit } from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import Button from "~/components/button/button";
import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { getTxBuilder } from "../common";
import {
  getNativeScript,
  makePayment,
  registerDRep,
} from "./test-native-script";

export default function GovernanceRegistration() {
  return (
    <TwoColumnsScroll
      sidebarTo="registration"
      title="DRep Registration"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  const { wallet, connected } = useWallet();

  return (
    <>
      <Button onClick={() => getNativeScript()}>debug getNativeScript</Button>
      <Button onClick={() => makePayment(wallet)}>debug makePayment</Button>
      <Button onClick={() => registerDRep(wallet)}>debug registerDRep</Button>

      <Codeblock data={``} />
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();

  // const [address, setAddress] = useState<string>(demoAddresses.testnet);
  // const [asset, setAsset] = useState<string>(demoAsset);
  // const [amount, setAmount] = useState<string>("1");

  function getFile(url: string) {
    var Httpreq = new XMLHttpRequest();
    Httpreq.open("GET", url, false);
    Httpreq.send(null);
    return Httpreq.responseText;
  }

  async function getMeshJsonHash(url: string) {
    var drepAnchor = getFile(url);
    const anchorObj = JSON.parse(drepAnchor);
    const anchorHash = hashDrepAnchor(anchorObj);
    console.log("Anchor hash", anchorHash);
    return anchorHash;
  }

  async function runDemo() {
    const utxos = await wallet.getUtxos();
    const changeAddress = await wallet.getChangeAddress();

    const dRep = await wallet.getPubDRepKey();

    if (dRep === undefined)
      throw new Error("No DRep key found, this wallet does not support CIP95");

    const registrationFee = "500000000";
    const dRepId = dRep.dRepIDBech32;
    const anchorUrl = "https://meshjs.dev/governance/meshjs.jsonld";
    const anchorHash = await getMeshJsonHash(anchorUrl);
    console.log("dRepId", dRepId);

    // get utxo to pay for the registration
    const assetMap = new Map<Unit, Quantity>();
    assetMap.set("lovelace", registrationFee);
    const selectedUtxos = keepRelevant(assetMap, utxos);

    const txBuilder = getTxBuilder();
    const unsignedTx = await txBuilder
      .drepRegistrationCertificate(dRepId, registrationFee, {
        anchorUrl: anchorUrl,
        anchorDataHash: anchorHash,
      })
      .changeAddress(changeAddress)
      .selectUtxosFrom(selectedUtxos)
      .complete();

    console.log("Unsigned tx", unsignedTx);
    const signedTx = await wallet.signTx(unsignedTx);
    console.log("Signed tx", signedTx);

    // const txHash = await wallet.submitTx(signedTx);
    return "txHash";
  }

  let codeSnippet = `import { Transaction } from '@meshsdk/core';\n\n`;

  // codeSnippet += `const unsignedTx = await tx.build();\n`;
  // codeSnippet += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  // codeSnippet += `const txHash = await wallet.submitTx(signedTx);`;

  return (
    <LiveCodeDemo
      title="DRep Registration"
      subtitle="Register a DRep"
      code={codeSnippet}
      runCodeFunction={runDemo}
      disabled={!connected}
      runDemoButtonTooltip={
        !connected ? "Connect wallet to run this demo" : undefined
      }
      runDemoShowBrowseWalletConnect={true}
    >
      {/* <InputTable
        listInputs={[
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Address"
            label="Address"
            key={0}
          />,
          <Input
            value={asset}
            onChange={(e) => setAsset(e.target.value)}
            placeholder="Asset"
            label="Asset"
            key={1}
          />,
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount"
            label="Amount"
            key={2}
          />,
        ]}
      /> */}
    </LiveCodeDemo>
  );
}
