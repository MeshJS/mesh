import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../../../common/sectionTwoCol';
import Button from '../../../ui/button';
import { CardanoWallet, useWallet } from '@meshsdk/react';
import { useState } from 'react';
import RunDemoResult from '../../../common/runDemoResult';
import useLocalStorage from '../../../../hooks/useLocalStorage';
import { getContract } from './common';

export default function EscrowCancel() {
  return (
    <>
      <SectionTwoCol
        sidebarTo="cancelEscrow"
        header="Cancel Escrow"
        leftFn={Left()}
        rightFn={Right()}
      />
    </>
  );
}

function Left() {
  let code = ``;
  code += `const utxo = await contract.getUtxoByTxHash(txHashToSearchFor);\n`;
  code += `\n`;
  code += `const tx = await contract.cancelEscrow(utxo);\n`;
  code += `const signedTx = await wallet.signTx(tx, true);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <>
      <p>
        A user can cancel an escrow if the other party fails to fulfill the
        terms of the agreement. Cancel can be initiated by any users who have
        partcipated in the escrow and can be done at any time before complete.
      </p>
      <p>
        This function, `cancelEscrow()`, is used to cancel an escrow. The
        function accepts the following parameters:
      </p>
      <ul>
        <li>
          <b>escrowUtxo (UTxO)</b> - the utxo of the transaction to be canceled
        </li>
      </ul>
      <Codeblock data={code} isJson={false} />
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

      const utxo = await contract.getUtxoByTxHash(userLocalStorage);

      if (!utxo) {
        setResponseError('Input utxo not found');
        setLoading(false);
        return;
      }

      const tx = await contract.cancelEscrow(utxo);

      const signedTx = await wallet.signTx(tx, true);
      const txHash = await wallet.submitTx(signedTx);
      setResponse(txHash);
    } catch (error) {
      setResponseError(`${error}`);
    }
    setLoading(false);
  }

  if (userLocalStorage) {
    return (
      <Card>
        <p>
          At any time before the escrow is completed, the partcipated
          users/wallets can cancel the escrow.
        </p>
        {connected ? (
          <>
            <Button
              onClick={() => rundemo()}
              style={
                loading ? 'warning' : response !== null ? 'success' : 'light'
              }
              disabled={loading}
            >
              Cancel Escrow
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

  return <></>;
}