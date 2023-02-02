import { useState } from 'react';
import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import RunDemoButton from '../../../common/runDemoButton';
import RunDemoResult from '../../../common/runDemoResult';
import SectionTwoCol from '../../../common/sectionTwoCol';
import { useWallet } from '@meshsdk/react';
import ConnectCipWallet from '../../../common/connectCipWallet';

export default function GetUnusedAddresses() {
  return (
    <SectionTwoCol
      sidebarTo="getUnusedAddresses"
      header="Get Unused Addresses"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>Returns a list of unused addresses controlled by the wallet.</p>
    </>
  );
}

function Right() {
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const { wallet, connected } = useWallet();

  async function runDemo() {
    setLoading(true);
    let results = await wallet.getUnusedAddresses();
    setResponse(results);
    setLoading(false);
  }
  return (
    <>
      <Card>
        <div className="p-5 text-lg font-semibold text-left text-gray-900 bg-white dark:text-white dark:bg-gray-800">
          Get Unused Addresses
          <p className="mt-1 text-sm font-normal text-gray-500 dark:text-gray-400">
            Get addresses that are unused
          </p>
        </div>
        <Codeblock
          data={`const unusedAddresses = await wallet.getUnusedAddresses();`}
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
