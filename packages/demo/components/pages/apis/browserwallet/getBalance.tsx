import { useState } from 'react';
import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import RunDemoButton from '../common/runDemoButton';
import RunDemoResult from '../common/runDemoResult';
import SectionTwoCol from '../common/sectionTwoCol';
import useWallet from '../../../../contexts/wallet';
import ConnectCipWallet from '../common/connectCipWallet';

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
  return (
    <>
      <p>
        Returns a list of assets in the wallet. This API will return every
        assets in the wallet.
      </p>
      <Codeblock
        data={`const balance = await wallet.getBalance();
`}
        isJson={false}
      />
    </>
  );
}

function Right() {
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const { wallet, walletConnected, hasAvailableWallets } = useWallet();

  async function runDemo() {
    setLoading(true);
    let results = await wallet.getBalance();
    setResponse(results);
    setLoading(false);
  }
  return (
    <>
      {hasAvailableWallets && (
        <Card>
          {walletConnected ? (
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
      )}
    </>
  );
}
