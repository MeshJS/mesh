import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../../../common/sectionTwoCol';
import Button from '../../../ui/button';
import { CardanoWallet, useWallet } from '@meshsdk/react';
import { useState } from 'react';
import RunDemoResult from '../../../common/runDemoResult';
import useLocalStorage from '../../../../hooks/useLocalStorage';
import { getContract } from './common';

export default function TriggerPayout() {
  return (
    <>
      <SectionTwoCol
        sidebarTo="triggerPayout"
        header="Trigger Payout"
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
        <code>triggerPayout()</code> will split the locked amount equally among
        the list of payees. The function doesn't need any parameters.
      </p>
      <p>
        The function returns a transaction hash if the payout has been done
        successfully.
      </p>
      <p>The code snippet below demonstrates how to trigger the payout.</p>
    </>
  );
}

function Right() {
  const { connected, wallet } = useWallet();
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);
  const [userLocalStorage, setUserlocalStorage] = useLocalStorage(
    'mesh_giftcard_demo',
    undefined
  );

  async function rundemo() {
    setLoading(true);
    setResponse(null);
    setResponseError(null);

    try {
      const contract = getContract(wallet);
      const txHash = await contract.triggerPaypout();
      setResponse(txHash);
    } catch (error) {
      setResponseError(`${error}`);
    }
    setLoading(false);
  }

  let code = ``;
  code += `const txHash = await contract.triggerPaypout();\n`;

  return (
    <Card>
      <p>
        This demo, we will trigger the payout of the locked amount equally among
        the list of payees. The amount has been locked in the previous step.
      </p>
      <Codeblock data={code} isJson={false} />
      {connected ? (
        <>
          <Button
            onClick={() => rundemo()}
            style={
              loading ? 'warning' : response !== null ? 'success' : 'light'
            }
            disabled={loading || userLocalStorage === undefined}
          >
            Trigger Paypout
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
