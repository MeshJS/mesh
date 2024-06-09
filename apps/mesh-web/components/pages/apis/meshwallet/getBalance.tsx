import { useState } from 'react';
import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import RunDemoButton from '../../../common/runDemoButton';
import RunDemoResult from '../../../common/runDemoResult';
import SectionTwoCol from '../../../common/sectionTwoCol';
import { getMeshWallet } from './common';

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
        assets in the wallet. Each asset is an object with the following
        properties:
      </p>
      <ul>
        <li>
          A unit is provided to display asset's name on the user interface.
        </li>
        <li>
          A quantity is provided to display asset's quantity on the user
          interface.
        </li>
      </ul>
      <p>Example:</p>
      <Codeblock data={codeSample} isJson={false} />
    </>
  );
}

function Right() {
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);

  async function runDemo() {
    setLoading(true);
    const wallet = getMeshWallet();
    let results = await wallet.getBalance();
    setResponse(results);
    setLoading(false);
  }
  return (
    <>
      <Card>
        <div className="p-5 text-lg font-semibold text-left text-gray-900 bg-white dark:text-white dark:bg-gray-800">
          Get Balance
          <p className="mt-1 text-sm font-normal text-gray-500 dark:text-gray-400">
            Get all assets in the connected wallet
          </p>
        </div>
        <Codeblock
          data={`const balance = await wallet.getBalance();`}
          isJson={false}
        />
        <RunDemoButton
          runDemoFn={runDemo}
          loading={loading}
          response={response}
        />
        <RunDemoResult response={response} />
      </Card>
    </>
  );
}
