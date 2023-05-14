import { useState } from 'react';
import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../../../common/sectionTwoCol';
import RunDemoButton from '../../../common/runDemoButton';
import RunDemoResult from '../../../common/runDemoResult';
import useAppWallet from '../../../../contexts/appWallet';

export default function GetPaymentAddress() {
  return (
    <SectionTwoCol
      sidebarTo="getPaymentAddress"
      header="Get Payment Address"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
  let code = `const address = wallet.getPaymentAddress();\n`;

  return (
    <>
      <p>
        Get wallet's address. For multi-addresses wallet, it will return the
        first address. To choose other address, `accountIndex` can be specified.
      </p>
      <Codeblock data={code} isJson={false} />
    </>
  );
}

function Right() {
  const { wallet, walletConnected } = useAppWallet();
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);

  async function runDemo() {
    setLoading(true);
    const address = wallet.getPaymentAddress();
    setResponse(address);
    setLoading(false);
  }

  return (
    <>
      <Card>
        <div className="p-5 text-lg font-semibold text-left text-gray-900 bg-white dark:text-white dark:bg-gray-800">
          Get Payment Address
        </div>
        {!walletConnected && <p>Load a wallet to try this endpoint.</p>}
        <RunDemoButton
          runDemoFn={runDemo}
          loading={loading}
          response={response}
          label="Get payment address"
          disabled={!walletConnected}
        />
        <RunDemoResult response={response} />
      </Card>
    </>
  );
}
