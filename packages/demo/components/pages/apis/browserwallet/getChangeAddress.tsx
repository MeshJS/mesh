import { useState } from 'react';
import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import RunDemoButton from '../../../common/runDemoButton';
import RunDemoResult from '../../../common/runDemoResult';
import SectionTwoCol from '../../../common/sectionTwoCol';
import { useWallet } from '@meshsdk/react';
import ConnectCipWallet from '../../../common/connectCipWallet';

export default function GetChangeAddress() {
  return (
    <SectionTwoCol
      sidebarTo="getChangeAddress"
      header="Get Change Address"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        Returns an address owned by the wallet that should be used as a change
        address to return leftover assets during transaction creation back to
        the connected wallet.
      </p>
    </>
  );
}

function Right() {
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const { wallet, connected } = useWallet();

  async function runDemo() {
    setLoading(true);
    let results = await wallet.getChangeAddress();
    setResponse(results);
    setLoading(false);
  }
  return (
    <>
      <Card>
        <div className="p-5 text-lg font-semibold text-left text-gray-900 bg-white dark:text-white dark:bg-gray-800">
          Get Change Address
          <p className="mt-1 text-sm font-normal text-gray-500 dark:text-gray-400">
            Get address that should be used for transaction's change
          </p>
        </div>
        <Codeblock
          data={`const changeAddress = await wallet.getChangeAddress();`}
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
