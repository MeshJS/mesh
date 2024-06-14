import { useState } from 'react';
import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import RunDemoButton from '../../../common/runDemoButton';
import RunDemoResult from '../../../common/runDemoResult';
import SectionTwoCol from '../../../common/sectionTwoCol';
import { getMeshWallet } from './common';

export default function GetUtxos() {
  return (
    <SectionTwoCol
      sidebarTo="getUtxos"
      header="Get UTXOs"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
  let example = ``;
  example += `[\n`;
  example += `  {\n`;
  example += `    "input": {\n`;
  example += `      "outputIndex": 0,\n`;
  example += `      "txHash": "16dcbb1f93b4f9d5e...9106c7b121463c210ba"\n`;
  example += `    },\n`;
  example += `    "output": {\n`;
  example += `      "address": "addr_test1qzag7whju08xwrq...z0fr8c3grjmysgaw9y8",\n`;
  example += `      "amount": [\n`;
  example += `        {\n`;
  example += `          "unit": "lovelace",\n`;
  example += `          "quantity": "1314550"\n`;
  example += `        },\n`;
  example += `        {\n`;
  example += `          "unit": "f05c91a850...3d824d657368546f6b656e3032",\n`;
  example += `          "quantity": "1"\n`;
  example += `        }\n`;
  example += `      ]\n`;
  example += `    }\n`;
  example += `  }\n`;
  example += `]\n`;
  return (
    <>
      <p>
        Return a list of all UTXOs (unspent transaction outputs) controlled by
        the wallet. For example:
      </p>
      <Codeblock data={example} isJson={false} />
      <p>Options:</p>
      <ul>
        <li>
          <code>addressType</code> - "enterprise" | "base" = "base"
        </li>
      </ul>
    </>
  );
}

function Right() {
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);

  async function runDemo() {
    setLoading(true);
    const wallet = getMeshWallet();
    let results = await wallet.getUtxos();
    setResponse(results);
    setLoading(false);
  }
  return (
    <>
      <Card>
        <div className="p-5 text-lg font-semibold text-left text-gray-900 bg-white dark:text-white dark:bg-gray-800">
          Get UTXOs
          <p className="mt-1 text-sm font-normal text-gray-500 dark:text-gray-400">
            Get UTXOs of the connected wallet
          </p>
        </div>
        <Codeblock
          data={`const utxos = await wallet.getUtxos();`}
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
