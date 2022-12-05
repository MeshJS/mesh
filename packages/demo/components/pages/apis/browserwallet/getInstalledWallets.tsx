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
      header="Get installed wallets"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        Returns a list of wallets installed on user's device. An{' '}
        <code>icon</code> is provided to display wallet's icon on the user
        interface.
      </p>
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
