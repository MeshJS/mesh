import { useState } from 'react';
import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import RunDemoButton from '../../../common/runDemoButton';
import RunDemoResult from '../../../common/runDemoResult';
import SectionTwoCol from '../../../common/sectionTwoCol';
import useWallet from '../../../../contexts/wallet';
import ConnectCipWallet from '../../../common/connectCipWallet';

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
  return (
    <>
      <p>
        Return a list of all UTXOs (unspent transaction outputs) controlled by
        the wallet. ADA balance and multiasset value in each UTXO are specified
        in <code>amount</code>.
      </p>
    </>
  );
}

function Right() {
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const { wallet, walletConnected, hasAvailableWallets } = useWallet();

  async function runDemo() {
    setLoading(true);
    let results = await wallet.getUtxos();
    setResponse(results);
    setLoading(false);
  }
  return (
    <>
      <Card>
        <Codeblock
          data={`const utxos = await wallet.getUtxos();`}
          isJson={false}
        />
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
          hasAvailableWallets && <ConnectCipWallet />
        )}
      </Card>
    </>
  );
}
