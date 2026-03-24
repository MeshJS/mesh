import { Data, Transaction } from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";

import Link from "~/components/link";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { getScript, getWalletAddress } from "../common";

export default function AikenLock() {
  return (
    <TwoColumnsScroll
      sidebarTo="lock"
      title="Create transaction to lock tokens"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let codeGetScript = ``;
  codeGetScript += `function getScript() {\n`;
  codeGetScript += `  const scriptCbor = applyParamsToScript(compiledCode, []);\n`;
  codeGetScript += `\n`;
  codeGetScript += `  const script: PlutusScript = {\n`;
  codeGetScript += `    code: scriptCbor,\n`;
  codeGetScript += `    version: "V2",\n`;
  codeGetScript += `  };\n`;
  codeGetScript += `  const scriptAddress = resolvePlutusScriptAddress(script, 0);\n`;
  codeGetScript += `  return { script, scriptAddress };\n`;
  codeGetScript += `}\n`;

  let codeGetWallet = ``;
  codeGetWallet += `async function getWalletAddress(wallet: BrowserWallet) {\n`;
  codeGetWallet += `  const addresses = await wallet.getUsedAddresses();\n`;
  codeGetWallet += `  const address = addresses[0];\n`;
  codeGetWallet += `\n`;
  codeGetWallet += `  if (!address) {\n`;
  codeGetWallet += `    throw new Error("No address found");\n`;
  codeGetWallet += `  }\n`;
  codeGetWallet += `\n`;
  codeGetWallet += `  const hash = resolvePaymentKeyHash(address);\n`;
  codeGetWallet += `  return { address, hash };\n`;
  codeGetWallet += `}\n`;

  let codeDatum = ``;
  codeDatum += `const datum: Data = {\n`;
  codeDatum += `  alternative: 0,\n`;
  codeDatum += `  fields: [hash],\n`;
  codeDatum += `};\n`;

  let codeTransaction = ``;
  codeTransaction += `const tx = new Transaction({ initiator: wallet });\n`;
  codeTransaction += `tx.sendLovelace(\n`;
  codeTransaction += `  {\n`;
  codeTransaction += `    address: scriptAddress,\n`;
  codeTransaction += `    datum: { value: datum },\n`;
  codeTransaction += `  },\n`;
  codeTransaction += `  "5000000",\n`;
  codeTransaction += `);\n`;
  codeTransaction += `\n`;
  codeTransaction += `const unsignedTx = await tx.build();\n`;
  codeTransaction += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  codeTransaction += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <>
      <p>
        In this section, we will create a simple UI that allows users to lock
        assets on the Cardano blockchain.
      </p>
      <p>
        First, we get initialze the <code>PlutusScript</code> and resolve the
        script address:
      </p>
      <Codeblock data={codeGetScript} />
      <Codeblock data={`const { scriptAddress } = await getScript();`} />
      <p>
        We are using the `resolvePlutusScriptAddress` function to resolve the
        script address.
      </p>
      <p>
        You notice here we use the <code>applyParamsToScript</code>, which apply
        parameters to a script allows you to create a custom{" "}
        <Link href="https://cips.cardano.org/cip/cip-57">
          CIP-57 compliant script
        </Link>{" "}
        based on some inputs. For this script, we don't have any parameters to
        apply, but simply applied with double CBOR encoding to{" "}
        <code>scriptCbor</code>.
      </p>
      <p>Next, we get the wallet address hash:</p>{" "}
      <Codeblock data={codeGetWallet} />
      <Codeblock data={`const { hash } = await getWalletAddress(wallet);`} />
      <p>
        Here, we use the `resolvePaymentKeyHash` function to resolve the payment
        key hash of the wallet.
      </p>
      <p>
        Then, we create the <code>Data</code> (datum) object containing the
        address hash:
      </p>
      <Codeblock data={codeDatum} />
      <p>
        Finally, we prepare the transaction to lock the assets on the Cardano
        blockchain.
      </p>
      <Codeblock data={codeTransaction} />
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();

  async function runDemo() {
    const { scriptAddress } = await getScript();

    const { hash } = await getWalletAddress(wallet);

    const datum: Data = {
      alternative: 0,
      fields: [hash],
    };

    const tx = new Transaction({ initiator: wallet }).setNetwork("preprod");
    tx.sendLovelace(
      {
        address: scriptAddress,
        datum: { value: datum },
      },
      "5000000",
    );

    const unsignedTx = await tx.build();
    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);
    return txHash;
  }

  return (
    <LiveCodeDemo
      title="Lock Assets"
      subtitle="We create the transactions to lock assets on the Cardano blockchain."
      runCodeFunction={runDemo}
      disabled={!connected}
      runDemoButtonTooltip={
        !connected ? "Connect wallet to run this demo" : undefined
      }
      runDemoShowBrowseWalletConnect={true}
    ></LiveCodeDemo>
  );
}
