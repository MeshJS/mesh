import { useState } from 'react';
import Codeblock from '../../../ui/codeblock';
import { BrowserWallet } from '@meshsdk/core';
import Card from '../../../ui/card';
import RunDemoButton from '../../../common/runDemoButton';
import RunDemoResult from '../../../common/runDemoResult';
import SectionTwoCol from '../../../common/sectionTwoCol';

export default function GetInstalledWallets() {
  return (
    <SectionTwoCol
      sidebarTo="getInstallWallets"
      header="Get Installed Wallets"
      leftFn={Left()}
      rightFn={Right()}
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
        Returns a list of wallets installed on user's device. Each wallet is an object with the following properties:
      </p>
      <ul>
        <li>A name is provided to display wallet's name on the user interface.</li>
        <li>A version is provided to display wallet's version on the user interface.</li>
        <li>An icon is provided to display wallet's icon on the user interface.</li>
      </ul>
      <p>
        Example:
      </p>
      <Codeblock data={example} isJson={false} />
    </>
  );
}

function Right() {
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);

  async function runDemo() {
    setLoading(true);
    let results = BrowserWallet.getInstalledWallets();
    setResponse(results);
    setLoading(false);
  }
  return (
    <Card>
      <div className="p-5 text-lg font-semibold text-left text-gray-900 bg-white dark:text-white dark:bg-gray-800">
        Get Installed Wallets
        <p className="mt-1 text-sm font-normal text-gray-500 dark:text-gray-400">
          Get a list of wallets on user's device
        </p>
      </div>
      <Codeblock data={`BrowserWallet.getInstalledWallets();`} isJson={false} />
      <RunDemoButton
        runDemoFn={runDemo}
        loading={loading}
        response={response}
      />
      <RunDemoResult response={response} />
    </Card>
  );
}
