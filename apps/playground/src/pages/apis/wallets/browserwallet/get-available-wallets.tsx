import { BrowserWallet } from "@meshsdk/core";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function BrowserWalletGetAvailableWallets() {
  return (
    <TwoColumnsScroll
      sidebarTo="getAvailableWallets"
      title="Get Available Wallets"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let example = ``;
  example += `[\n`;
  example += `  {\n`;
  example += `    "id": "nufiSnap",\n`;
  example += `    "name": "MetaMask",\n`;
  example += `    "icon": "data:image/svg+xml;base64,ICONBASE64HERE",\n`;
  example += `    "version": "1.1.0"\n`;
  example += `  },\n`;
  example += `  {\n`;
  example += `    "name": "eternl",\n`;
  example += `    "icon": "data:image/png;base64,ICONBASE64HERE",\n`;
  example += `    "version": "0.1.0"\n`;
  example += `  }\n`;
  example += `]\n`;

  return (
    <>
      <p>
        Returns a list of wallets available on user's device. Each wallet is an
        object with the following properties:
      </p>
      <ul>
        <li>
          A name is provided to display wallet's name on the user interface.
        </li>
        <li>
          A version is provided to display wallet's version on the user
          interface.
        </li>
        <li>
          An icon is provided to display wallet's icon on the user interface.
        </li>
      </ul>
      <p>Example:</p>
      <Codeblock data={example} />

      <p>
        With NuFi's support, you can specify the network to connect to. By
        default, it is set to "preprod". To define the <code>network</code>:
      </p>
      <Codeblock
        data={`await BrowserWallet.getAvailableWallets({ metamask:{ network: "mainnet"} })`}
      />
      <p>Available networks are:</p>
      <ul>
        <li>production: https://wallet.nu.fi</li>
        <li>mainnet: https://wallet-staging.nu.fi</li>
        <li>preprod: https://wallet-testnet-staging.nu.fi</li>
        <li>preview: https://wallet-preview-staging.nu.fi</li>
      </ul>
      <p>You can also specify the network by providing the URL:</p>
      <Codeblock
        data={`await BrowserWallet.getAvailableWallets({ metamask:{ network: "https://wallet.nu.fi"} })`}
      />
    </>
  );
}

function Right() {
  async function runDemo() {
    return await BrowserWallet.getAvailableWallets();
  }

  let codeSnippet = "";
  codeSnippet += `import { BrowserWallet } from '@meshsdk/core';\n\n`;
  codeSnippet += `await BrowserWallet.getAvailableWallets()`;

  return (
    <LiveCodeDemo
      title="Get Available Wallets"
      subtitle="Get a list of wallets on user's device"
      code={codeSnippet}
      runCodeFunction={runDemo}
    />
  );
}
