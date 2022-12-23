import { useState } from 'react';
import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import RunDemoButton from '../../../common/runDemoButton';
import RunDemoResult from '../../../common/runDemoResult';
import SectionTwoCol from '../../../common/sectionTwoCol';
import { useWallet } from '@meshsdk/react';

import ConnectCipWallet from '../../../common/connectCipWallet';

export default function GetBalance() {
  return (
    <SectionTwoCol
      sidebarTo="getBalance"
      header="Get Balance"
      leftFn={Left()}
      rightFn={Right()}
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
        Returns a list of assets in the wallet. This API will return every
        assets in the wallet, example:
      </p>
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
    let results = await wallet.getBalance();
    setResponse(results);
    setLoading(false);
  }
  return (
    <>
      <Card>
        <Codeblock
          data={`const balance = await wallet.getBalance();`}
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
