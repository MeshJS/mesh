import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../../../common/sectionTwoCol';
import Button from '../../../ui/button';
import { CardanoWallet, useWallet } from '@meshsdk/react';
import { useState } from 'react';
import RunDemoResult from '../../../common/runDemoResult';
import { getContract } from './common';
import Input from '../../../ui/input';

export default function PaymentSplitterSendLovelace() {
  return (
    <>
      <SectionTwoCol
        sidebarTo="sendLovelaceToSplitter"
        header="Send Lovelace to Payment Splitter"
        leftFn={Left()}
        rightFn={Right()}
      />
    </>
  );
}

function Left() {
  return (
    <>
      <p>
        <code>sendLovelaceToSplitter()</code> will lock Lovelace in the
        contract. The function accepts the following parameters:
      </p>
      <ul>
        <li>
          <b>lovelaceAmount (number)</b> - the amount of Lovelace you want to
          send to the contract
        </li>
      </ul>
      <p>The function returns a transaction hash.</p>
    </>
  );
}

function Right() {
  const { connected, wallet } = useWallet();
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);
  const [listPrice, updateListPrice] = useState<number>(10000000);

  async function rundemo() {
    setLoading(true);
    setResponse(null);
    setResponseError(null);

    try {
      const contract = getContract(wallet);
      const txHash = await contract.sendLovelaceToSplitter(listPrice);
      setResponse(txHash);
    } catch (error) {
      setResponseError(`${error}`);
    }
    setLoading(false);
  }

  let code = ``;
  code += `const lovelaceAmount: number = ${listPrice};\n`;
  code += `\n`;
  code += `const txHash = await contract.sendLovelaceToSplitter(lovelaceAmount);\n`;

  return (
    <Card>
      <p>
        This demo, shows how to send {listPrice} Ada to the payment splitter.
      </p>
      <Input
        value={listPrice}
        onChange={(e) => updateListPrice(e.target.value)}
        placeholder="Amount in Lovelace"
        label="Amount in Lovelace"
      />
      <Codeblock data={code} isJson={false} />
      {connected ? (
        <>
          <Button
            onClick={() => rundemo()}
            style={
              loading ? 'warning' : response !== null ? 'success' : 'light'
            }
            disabled={loading}
          >
            Send Lovelace to Payment Splitter
          </Button>
          <RunDemoResult response={response} />
        </>
      ) : (
        <CardanoWallet />
      )}
      <RunDemoResult response={responseError} label="Error" />
    </Card>
  );
}
