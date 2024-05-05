import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../../../common/sectionTwoCol';
import Button from '../../../ui/button';
import { CardanoWallet, useWallet } from '@meshsdk/react';
import { useState } from 'react';
import RunDemoResult from '../../../common/runDemoResult';
import useLocalStorage from '../../../../hooks/useLocalStorage';
import Link from 'next/link';
import { getContract } from './common';

export default function VestingWithdrawFund() {
  return (
    <>
      <SectionTwoCol
        sidebarTo="withdrawFund"
        header="Withdraw Fund"
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
        After the lockup period has expired, the beneficiary can withdraw the
        funds from the vesting contract.
      </p>
      <p>
        <code>withdrawFund()</code> withdraw funds
        from a vesting contract. The function accepts the following parameters:
      </p>
      <ul>
        <li>
          <b>vestingUtxo (UTxO)</b> - unspent transaction output in the script
        </li>
      </ul>
    </>
  );
}

function Right() {
  const { connected, wallet } = useWallet();
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);
  const [userLocalStorage, setUserlocalStorage] = useLocalStorage(
    'mesh_vesting_demo',
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

      const tx = await contract.withdrawFund(utxo);
      const signedTx = await wallet.signTx(tx, true);
      const txHash = await wallet.submitTx(signedTx);
      setResponse(txHash);
    } catch (error) {
      setResponseError(`${error}`);
    }
    setLoading(false);
  }

  let code = ``;
  code += 'const utxo = await contract.getUtxoByTxHash(txHashToSearchFor);\n';
  code += 'const tx = await contract.withdrawFund(utxo);\n';
  code += 'const signedTx = await wallet.signTx(tx, true);\n';
  code += 'const txHash = await wallet.submitTx(signedTx);\n';

  return (
    <Card>
      <p>
        For this demo, connect with{' '}
        <Link href="https://meshjs.dev/apis/appwallet#loadWallet">
          Mesh's "solution" wallet
        </Link>
        , to withdraw funds from the vesting contract.
      </p>
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
            Withdraw Fund
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
