import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import useMeshWallet from "~/contexts/mesh-wallet";

export default function MeshWalletGetBalance() {
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
  let codeSample = `[
`;
  codeSample += `  {
`;
  codeSample += `    "unit": "lovelace",
`;
  codeSample += `    "quantity": "796105407"
`;
  codeSample += `  },
`;
  codeSample += `  {
`;
  codeSample += `    "unit": "0f5560dbc05282e05507aedb02d823d9d9f0e583cce579b81f9d1cd8",
`;
  codeSample += `    "quantity": "1"
`;
  codeSample += `  },
`;
  codeSample += `  {
`;
  codeSample += `    "unit": "9c8e9da7f81e3ca90485f32ebefc98137c8ac260a072a00c4aaf142d4d657368546f6b656e",
`;
  codeSample += `    "quantity": "2"
`;
  codeSample += `  },
`;
  codeSample += `]
`;

  return (
    <>
      <p>
        This API returns a comprehensive list of all assets in the wallet,
        including lovelace. Each asset is represented as an object with the
        following properties:
      </p>
      <ul>
        <li>
          <code>unit</code>: A unique identifier for the asset, often used for
          display purposes.
        </li>
        <li>
          <code>quantity</code>: The amount of the asset held in the wallet.
        </li>
      </ul>
      <p>Example response:</p>
      <Codeblock data={codeSample} />
    </>
  );
}

function Right() {
  const { getWallet } = useMeshWallet();
  async function runDemo() {
    const wallet = getWallet();
    let results = await wallet.getBalance();
    return results;
  }
  return (
    <LiveCodeDemo
      title="Get Balance"
      subtitle="Get all assets in the connected wallet"
      code={`const balance = await wallet.getBalance();`}
      runCodeFunction={runDemo}
    />
  );
}
