import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../../../common/sectionTwoCol';
import Button from '../../../ui/button';
import { CardanoWallet, useWallet } from '@meshsdk/react';
import { useState } from 'react';
import RunDemoResult from '../../../common/runDemoResult';
import { Asset } from '@meshsdk/core';
import useLocalStorage from '../../../../hooks/useLocalStorage';
import Link from 'next/link';
import { getContract } from './common';

export default function EscrowDeposit() {
  return (
    <>
      <SectionTwoCol
        sidebarTo="recipientDeposit"
        header="Recipient Deposit"
        leftFn={Left()}
        rightFn={Right()}
      />
    </>
  );
}

function Left() {
  let code = ``;
  code += `const depositAmount: Asset[] = [\n`;
  code += `  {\n`;
  code += `    unit: '64af286e2ad0df4de2e7de15f8ff5b3d27faecf4ab2757056d860a424d657368546f6b656e',\n`;
  code += `    quantity: '1',\n`;
  code += `  },\n`;
  code += `];\n`;
  code += `\n`;
  code += `const utxo = await contract.getUtxoByTxHash(txHashToSearchFor);\n`;
  code += `\n`;
  code += `const tx = await contract.recipientDeposit(utxo, depositAmount);\n`;
  code += `const signedTx = await wallet.signTx(tx, true);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <>
      <p>User B can deposit funds into the escrow after initiation.</p>
      <p>
        This function, `recipientDeposit()`, is used to deposit funds into the
        escrow. The function accepts the following parameters:
      </p>
      <ul>
        <li>
          <b>escrowUtxo (UTxO)</b> - the utxo of the transaction after{' '}
          <code>initiateEscrow()</code>
        </li>
        <li>
          <b>depositAmount (Asset[])</b> - a list of assets user B is trading /
          sending
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

      const depositAmount: Asset[] = [
        {
          unit: '64af286e2ad0df4de2e7de15f8ff5b3d27faecf4ab2757056d860a424d657368546f6b656e',
          quantity: '1',
        },
      ];

      const tx = await contract.recipientDeposit(utxo, depositAmount);

      const signedTx = await wallet.signTx(tx, true);
      const txHash = await wallet.submitTx(signedTx);
      setUserlocalStorage(txHash);
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
          Connect with wallet B to deposit assets. This demo will deposit 1 Mesh
          Token (you can mint it{' '}
          <Link href="/apis/transaction/minting">here</Link>).
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
              Deposit Fund
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
