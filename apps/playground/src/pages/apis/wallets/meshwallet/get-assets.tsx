import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import useMeshWallet from "~/contexts/mesh-wallet";

export default function MeshWalletGetAssets() {
  return (
    <TwoColumnsScroll
      sidebarTo="getAssets"
      title="Get Assets"
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
  codeSample += `    "unit": "1207329a668cf5c42b80a220a8c85d5e82ac0b6f5ecedda4c07a8acc4d657368486f6e6f72546f6b656e2d3530343935",
`;
  codeSample += `    "policyId": "1207329a668cf5c42b80a220a8c85d5e82ac0b6f5ecedda4c07a8acc",
`;
  codeSample += `    "assetName": "Mesh Token Of Appreciation",
`;
  codeSample += `    "fingerprint": "asset1dw74h0w0meqg9cxkc9sezp8zqcxu8nl93fzfpz",
`;
  codeSample += `    "quantity": "1"
`;
  codeSample += `  }
`;
  codeSample += `  {
`;
  codeSample += `    "unit": "9c8e9da7f81e3ca90485f32ebefc98137c8ac260a072a00c4aaf142d4d657368546f6b656e",
`;
  codeSample += `    "policyId": "9c8e9da7f81e3ca90485f32ebefc98137c8ac260a072a00c4aaf142d",
`;
  codeSample += `    "assetName": "MeshToken",
`;
  codeSample += `    "fingerprint": "asset177e7535dclmkkph8ewt9fsghllkwmpspa3n98p",
`;
  codeSample += `    "quantity": "10"
`;
  codeSample += `  }
`;
  codeSample += `]
`;

  return (
    <>
      <p>
        This API retrieves a list of assets in the wallet, excluding lovelace. Each asset is represented as an object with the following properties:
      </p>
      <ul>
        <li><code>unit</code>: A unique identifier for the asset.</li>
        <li><code>policyId</code>: The policy ID associated with the asset.</li>
        <li><code>assetName</code>: The name of the asset.</li>
        <li><code>fingerprint</code>: A unique fingerprint for the asset.</li>
        <li><code>quantity</code>: The amount of the asset held in the wallet.</li>
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
    let results = await wallet.getAssets();
    return results;
  }
  return (
    <LiveCodeDemo
      title="Get Assets"
      subtitle="Get assets in the connected wallet"
      code={`const assets = await wallet.getAssets();`}
      runCodeFunction={runDemo}
    />
  );
}
