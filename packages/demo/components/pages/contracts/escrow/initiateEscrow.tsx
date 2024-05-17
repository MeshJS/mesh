import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../../../common/sectionTwoCol';
import Button from '../../../ui/button';
import { CardanoWallet, useWallet } from '@meshsdk/react';
import { useState } from 'react';
import RunDemoResult from '../../../common/runDemoResult';
import useLocalStorage from '../../../../hooks/useLocalStorage';
import { getContract } from './common';
import { Asset } from '@meshsdk/common';

export default function EscrowInitiate() {
  return (
    <>
      <SectionTwoCol
        sidebarTo="initiateEscrow"
        header="Initiate Escrow"
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
        An escrow is initiated by one of the party, user A, by locking assets to
        the escrow contract.
      </p>
      <p>
        <code>initiateEscrow()</code> initiate an escrow. The function accepts
        the following parameters:
      </p>
      <ul>
        <li>
          <b>escrowAmount (Asset[])</b> - a list of assets user A is trading
        </li>
      </ul>
      <p>
        The function returns a transaction hex if the escrow is successfully
        initiated.
      </p>
    </>
  );
}

function Right() {
  const { connected, wallet } = useWallet();
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);
  const [userLocalStorage, setUserlocalStorage] = useLocalStorage(
    'mesh_escrow_demo',
    undefined
  );

  async function rundemo() {
    setLoading(true);
    setResponse(null);
    setResponseError(null);

    try {
      const contract = getContract(wallet);

      const escrowAmount: Asset[] = [
        {
          unit: 'lovelace',
          quantity: '10000000',
        },
      ];
      const tx = await contract.initiateEscrow(escrowAmount);

      const signedTx = await wallet.signTx(tx);
      const txHash = await wallet.submitTx(signedTx);
      setUserlocalStorage(txHash);
      setResponse(txHash);
    } catch (error) {
      setResponseError(`${error}`);
    }
    setLoading(false);
  }

  let code = ``;
  code += `const escrowAmount: Asset[] = [\n`;
  code += `  {\n`;
  code += `    unit: 'lovelace',\n`;
  code += `    quantity: '10000000',\n`;
  code += `  },\n`;
  code += `];\n`;
  code += ` \n`;
  code += `const tx = await contract.initiateEscrow(escrowAmount);\n`;
  code += `const signedTx = await wallet.signTx(tx);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);`;

  return (
    <Card>
      <p>This demo, wallet A initiate an escrow with 10 ADA.</p>
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
            Initiate Escrow
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
