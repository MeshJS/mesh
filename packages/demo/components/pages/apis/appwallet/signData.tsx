import { useState } from 'react';
import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../../../common/sectionTwoCol';
import RunDemoButton from '../../../common/runDemoButton';
import RunDemoResult from '../../../common/runDemoResult';
import useAppWallet from '../../../../contexts/appWallet';
import Input from '../../../ui/input';

export default function SignData() {
  const [payload, setPayload] = useState<string>('mesh');

  return (
    <SectionTwoCol
      sidebarTo="signData"
      header="Sign Data"
      leftFn={Left()}
      rightFn={Right(payload, setPayload)}
    />
  );
}

function Left() {
  let code = `const address = wallet.getPaymentAddress();\n`;
  code += `const signature = wallet.signData(address, payload);`;

  return (
    <>
      <p>
        Sign data allows you to sign a payload to identify the wallet ownership.
      </p>
      <Codeblock data={code} isJson={false} />
    </>
  );
}

function Right(payload, setPayload) {
  const { wallet, walletConnected } = useAppWallet();
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);

  async function runDemo() {
    setLoading(true);
    const address = wallet.getPaymentAddress();
    const signature = wallet.signData(address, payload);
    setResponse(signature);
    setLoading(false);
  }

  return (
    <>
      <Card>
        <InputTable payload={payload} setPayload={setPayload} />
        {!walletConnected && <p>Load a wallet to try this endpoint.</p>}
        <RunDemoButton
          runDemoFn={runDemo}
          loading={loading}
          response={response}
          label="Sign the payload"
          disabled={!walletConnected}
        />
        <RunDemoResult response={response} />
      </Card>
    </>
  );
}

function InputTable({ payload, setPayload }) {
  return (
    <div className="overflow-x-auto relative">
      <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400 m-0">
        <caption className="p-5 text-lg font-semibold text-left text-gray-900 bg-white dark:text-white dark:bg-gray-800">
          Sign data
          <p className="mt-1 text-sm font-normal text-gray-500 dark:text-gray-400">
            Define a payload and sign it with wallet.
          </p>
        </caption>
        <tbody>
          <tr className="bg-white border-b dark:bg-gray-800 dark:border-gray-700">
            <td>
              <Input
                value={payload}
                onChange={(e) => setPayload(e.target.value)}
                placeholder="Payload"
                label="Payload"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
