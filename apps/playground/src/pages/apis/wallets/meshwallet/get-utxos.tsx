import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import useMeshWallet from "~/contexts/mesh-wallet";
import { AboutGetAddressType } from "./common";

export default function MeshWalletGetUtxos() {
  return (
    <TwoColumnsScroll
      sidebarTo="getUtxos"
      title="Get UTXOs"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let example = ``;
  example += `[
`;
  example += `  {
`;
  example += `    "input": {
`;
  example += `      "outputIndex": 0,
`;
  example += `      "txHash": "16dcbb1f93b4f9d5e...9106c7b121463c210ba"
`;
  example += `    },
`;
  example += `    "output": {
`;
  example += `      "address": "addr_test1qzag7whju08xwrq...z0fr8c3grjmysgaw9y8",
`;
  example += `      "amount": [
`;
  example += `        {
`;
  example += `          "unit": "lovelace",
`;
  example += `          "quantity": "1314550"
`;
  example += `        },
`;
  example += `        {
`;
  example += `          "unit": "f05c91a850...3d824d657368546f6b656e3032",
`;
  example += `          "quantity": "1"
`;
  example += `        }
`;
  example += `      ]
`;
  example += `    }
`;
  example += `  }
`;
  example += `]
`;

  return (
    <>
      <p>
        This API retrieves a list of all UTXOs (unspent transaction outputs) controlled by the wallet. UTXOs are essential for constructing transactions and managing wallet balances.
      </p>
      <p>
        Each UTXO includes details such as the transaction hash, output index, address, and amount. These details are crucial for identifying and utilizing unspent outputs.
      </p>
      <p>Example response:</p>
      <Codeblock data={example} />

      <AboutGetAddressType />
    </>
  );
}

function Right() {
  const { getWallet } = useMeshWallet();
  async function runDemo() {
    const wallet = getWallet();
    let results = await wallet.getUtxos();
    return results;
  }
  return (
    <LiveCodeDemo
      title="Get UTXOs"
      subtitle="Get UTXOs of the connected wallet"
      code={`const utxos = await wallet.getUtxos();`}
      runCodeFunction={runDemo}
    />
  );
}
