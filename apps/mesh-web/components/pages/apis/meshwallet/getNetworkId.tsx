import { useState } from 'react';
import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import RunDemoButton from '../../../common/runDemoButton';
import RunDemoResult from '../../../common/runDemoResult';
import SectionTwoCol from '../../../common/sectionTwoCol';
import { getMeshWallet } from './common';

export default function GetNetworkId() {
  return (
    <SectionTwoCol
      sidebarTo="getNetworkId"
      header="Get Network ID"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        Returns the network ID of the currently connected account.{' '}
        <code>0</code> is testnet and <code>1</code> is mainnet but other
        networks can possibly be returned by wallets. Those other network ID
        values are not governed by CIP-30. This result will stay the same unless
        the connected account has changed.
      </p>
    </>
  );
}

function Right() {
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);

  async function runDemo() {
    setLoading(true);
    const wallet = getMeshWallet();
    let results = await wallet.getNetworkId();
    setResponse(results);
    setLoading(false);
  }
  return (
    <>
      <Card>
        <div className="p-5 text-lg font-semibold text-left text-gray-900 bg-white dark:text-white dark:bg-gray-800">
          Get Network ID
          <p className="mt-1 text-sm font-normal text-gray-500 dark:text-gray-400">
            Get currently connected network
          </p>
        </div>
        <Codeblock
          data={`const networkId = await wallet.getNetworkId();`}
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
