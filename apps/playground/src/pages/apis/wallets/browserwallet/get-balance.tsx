import { useWallet } from "@meshsdk/react";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function BrowserWalletGetBalance() {
  return (
    <TwoColumnsScroll
      sidebarTo="getBalance"
      title="Get Balance"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let codeSample = `[\n`;
  codeSample += `  {\n`;
  codeSample += `    "unit": "lovelace",\n`;
  codeSample += `    "quantity": "796105407"\n`;
  codeSample += `  },\n`;
  codeSample += `  {\n`;
  codeSample += `    "unit": "0f5560dbc05282e05507aedb02d823d9d9f0e583cce579b81f9d1cd8",\n`;
  codeSample += `    "quantity": "1"\n`;
  codeSample += `  },\n`;
  codeSample += `  {\n`;
  codeSample += `    "unit": "9c8e9da7f81e3ca90485f32ebefc98137c8ac260a072a00c4aaf142d4d657368546f6b656e",\n`;
  codeSample += `    "quantity": "2"\n`;
  codeSample += `  },\n`;
  codeSample += `]\n`;

  return (
    <>
      <p>
        This API retrieves a list of all assets in the connected wallet. Each asset is represented as an object containing the following properties:
      </p>
      <ul>
        <li>
          <strong>Unit:</strong> A unique identifier for the asset, which can be used to display its name in the user interface.
        </li>
        <li>
          <strong>Quantity:</strong> The amount of the asset held in the wallet.
        </li>
      </ul>
      <p>
        This information is useful for applications that need to display wallet balances or perform operations involving specific assets.
      </p>
      <p>Example:</p>
      <Codeblock data={codeSample} />
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();

  async function runDemo() {
    let results = await wallet.getBalance();
    return results;
  }
  return (
    <LiveCodeDemo
      title="Get Balance"
      subtitle="Get all assets in the connected wallet"
      code={`await wallet.getBalance();`}
      runCodeFunction={runDemo}
      disabled={!connected}
      runDemoButtonTooltip={
        !connected ? "Connect wallet to run this demo" : undefined
      }
      runDemoShowBrowseWalletConnect={true}
    />
  );
}
