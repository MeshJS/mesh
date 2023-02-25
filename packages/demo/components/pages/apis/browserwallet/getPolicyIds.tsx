import { useState } from 'react';
import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import RunDemoButton from '../../../common/runDemoButton';
import RunDemoResult from '../../../common/runDemoResult';
import SectionTwoCol from '../../../common/sectionTwoCol';
import { useWallet } from '@meshsdk/react';
import ConnectCipWallet from '../../../common/connectCipWallet';

export default function GetPolicyIds() {
  return (
    <SectionTwoCol
      sidebarTo="getPolicyIds"
      header="Get Policy IDs"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
  let example = ``;
  example += `[\n`;
  example += `  "0f5560dbc05282e05507aedb02d823d9d9f0e583cce579b81f9d1cd8",\n`;
  example += `  "5bed9e89299c69d9a54bbc82d88aa5a86698b2b7b9d0ed030fc4b0ff",\n`;
  example += `  "9c8e9da7f81e3ca90485f32ebefc98137c8ac260a072a00c4aaf142d",\n`;
  example += `]\n`;
  return (
    <>
      <p>Return a list of assets' policy ID. An example response would be:</p>
      <Codeblock data={example} isJson={false} />
    </>
  );
}

function Right() {
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const { wallet, connected } = useWallet();

  async function runDemo() {
    setLoading(true);
    let results = await wallet.getPolicyIds();
    setResponse(results);
    setLoading(false);
  }
  return (
    <>
      <Card>
        <div className="p-5 text-lg font-semibold text-left text-gray-900 bg-white dark:text-white dark:bg-gray-800">
          Get Policy IDs
          <p className="mt-1 text-sm font-normal text-gray-500 dark:text-gray-400">
            Get a list of policy IDs from all assets in wallet
          </p>
        </div>
        <Codeblock
          data={`const policyIds = await wallet.getPolicyIds();`}
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
