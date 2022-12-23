import { useState } from 'react';
import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import RunDemoButton from '../../../common/runDemoButton';
import RunDemoResult from '../../../common/runDemoResult';
import SectionTwoCol from '../../../common/sectionTwoCol';
import { useWallet } from '@meshsdk/react';
import ConnectCipWallet from '../../../common/connectCipWallet';

export default function GetAssets() {
  return (
    <SectionTwoCol
      sidebarTo="getAssets"
      header="Get Assets"
      leftFn={Left()}
      rightFn={Right()}
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
      <Codeblock data={codeSample} isJson={false} />
    </>
  );
}

function Right() {
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const { wallet, connected } = useWallet();

  async function runDemo() {
    setLoading(true);
    let results = await wallet.getAssets();
    setResponse(results);
    setLoading(false);
  }
  return (
    <>
      <Card>
        <Codeblock
          data={`const assets = await wallet.getAssets();`}
          isJson={false}
        />
        {connected ? (
          <>
            <RunDemoButton
              runDemoFn={runDemo}
              loading={loading}
              response={response}
            />
            <RunDemoResult response={response} />
          </>
        ) : (
          <ConnectCipWallet />
        )}
      </Card>
    </>
  );
}
