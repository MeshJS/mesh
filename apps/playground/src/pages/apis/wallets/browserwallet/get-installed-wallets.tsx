import { BrowserWallet } from "@meshsdk/core";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function BrowserWalletGetInstalledWallets() {
  return (
    <TwoColumnsScroll
      sidebarTo="getInstallWallets"
      title="Get Installed Wallets"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let example = ``;
  example += `[\n`;
  example += `  {\n`;
  example += `    "name": "eternl",\n`;
  example += `    "icon": "data:image/png;base64,ICONBASE64HERE=",\n`;
  example += `    "version": "0.1.0"\n`;
  example += `  }\n`;
  example += `]\n`;

  return (
    <>
      <p>
        This API retrieves a list of wallets installed on the user's device. Each wallet is represented as an object containing the following properties:
      </p>
      <ul>
        <li>
          <strong>Name:</strong> The name of the wallet, useful for identifying it in the user interface.
        </li>
        <li>
          <strong>Version:</strong> The version of the wallet, which can be used to ensure compatibility.
        </li>
        <li>
          <strong>Icon:</strong> A base64-encoded image representing the wallet's icon, useful for visual representation.
        </li>
      </ul>
      <p>
        Applications can use this information to display available wallets and allow users to select one for interaction.
      </p>
      <p>Example response:</p>
      <Codeblock data={example} />
    </>
  );
}

function Right() {
  async function runDemo() {
    return BrowserWallet.getInstalledWallets();
  }

  let codeSnippet = "";
  codeSnippet += `import { BrowserWallet } from '@meshsdk/core';\n\n`;
  codeSnippet += `BrowserWallet.getInstalledWallets();`;

  return (
    <LiveCodeDemo
      title="Get Installed Wallets"
      subtitle="Get a list of wallets on user's device"
      code={codeSnippet}
      runCodeFunction={runDemo}
    />
  );
}
