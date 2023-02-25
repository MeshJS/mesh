import { useState } from 'react';
import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import RunDemoButton from '../../../common/runDemoButton';
import RunDemoResult from '../../../common/runDemoResult';
import SectionTwoCol from '../../../common/sectionTwoCol';
import { useWallet } from '@meshsdk/react';
import ConnectCipWallet from '../../../common/connectCipWallet';

export default function GetCollateral() {
  return (
    <SectionTwoCol
      sidebarTo="getCollateral"
      header="Get Collateral"
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
  example += `      "outputIndex": 1,\n`;
  example += `      "txHash": "ff8d1e97c60989b4f...02ee937595ad741ff597af1"\n`;
  example += `    },\n`;
  example += `    "output": {\n`;
  example += `      "address": "addr_test1qzm...z0fr8c3grjmysm5e6yx",\n`;
  example += `      "amount": [ { "unit": "lovelace", "quantity": "5000000" } ]\n`;
  example += `    }\n`;
  example += `  }\n`;
  example += `]\n`;
  return (
    <>
      <p>
        This function shall return a list of one or more UTXOs (unspent
        transaction outputs) controlled by the wallet that are required to reach
        AT LEAST the combined ADA value target specified in amount AND the best
        suitable to be used as collateral inputs for transactions with plutus
        script inputs (pure ADA-only UTXOs).
      </p>
      <p>
        If this cannot be attained, an error message with an explanation of the
        blocking problem shall be returned. NOTE: wallets are free to return
        UTXOs that add up to a greater total ADA value than requested in the
        amount parameter, but wallets must never return any result where UTXOs
        would sum up to a smaller total ADA value, instead in a case like that
        an error message must be returned.
      </p>
      <p>Example of a response returned by this endpoint:</p>
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
    let results = await wallet.getCollateral();
    setResponse(results);
    setLoading(false);
  }
  return (
    <>
      <Card>
        <div className="p-5 text-lg font-semibold text-left text-gray-900 bg-white dark:text-white dark:bg-gray-800">
          Get Collateral
          <p className="mt-1 text-sm font-normal text-gray-500 dark:text-gray-400">
            Get list of UTXOs that used as collateral inputs for transactions
            with plutus script inputs
          </p>
        </div>
        <Codeblock
          data={`const collateralUtxos = await wallet.getCollateral();`}
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
