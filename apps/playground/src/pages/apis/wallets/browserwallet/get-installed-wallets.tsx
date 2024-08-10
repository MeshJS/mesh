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
        Returns a list of wallets installed on user's device. Each wallet is an
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
