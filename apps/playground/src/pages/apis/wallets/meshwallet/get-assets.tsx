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
  let codeSample = `[\n`;
  codeSample += `  {\n`;
  codeSample += `    "unit": "1207329a668cf5c42b80a220a8c85d5e82ac0b6f5ecedda4c07a8acc4d657368486f6e6f72546f6b656e2d3530343935",\n`;
  codeSample += `    "policyId": "1207329a668cf5c42b80a220a8c85d5e82ac0b6f5ecedda4c07a8acc",\n`;
  codeSample += `    "assetName": "Mesh Token Of Appreciation",\n`;
  codeSample += `    "fingerprint": "asset1dw74h0w0meqg9cxkc9sezp8zqcxu8nl93fzfpz",\n`;
  codeSample += `    "quantity": "1"\n`;
  codeSample += `  }\n`;
  codeSample += `  {\n`;
  codeSample += `    "unit": "9c8e9da7f81e3ca90485f32ebefc98137c8ac260a072a00c4aaf142d4d657368546f6b656e",\n`;
  codeSample += `    "policyId": "9c8e9da7f81e3ca90485f32ebefc98137c8ac260a072a00c4aaf142d",\n`;
  codeSample += `    "assetName": "MeshToken",\n`;
  codeSample += `    "fingerprint": "asset177e7535dclmkkph8ewt9fsghllkwmpspa3n98p",\n`;
  codeSample += `    "quantity": "10"\n`;
  codeSample += `  }\n`;
  codeSample += `]\n`;

  return (
    <>
      <p>Returns a list of assets in wallet excluding lovelace, example:</p>
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
