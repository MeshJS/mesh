import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../../../common/sectionTwoCol';
import Button from '../../../ui/button';
import { CardanoWallet, useWallet } from '@meshsdk/react';
import { useState } from 'react';
import RunDemoResult from '../../../common/runDemoResult';
import {
  Asset,
  BlockfrostProvider,
  KoiosProvider,
  MeshTxBuilder,
  PlutusScript,
  resolvePlutusScriptAddress,
} from '@meshsdk/core';
import { MeshVestingContract } from '@meshsdk/contracts';
import useLocalStorage from '../../../../hooks/useLocalStorage';
import Link from 'next/link';

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
  let code = ``;
  code += 'const utxo = await contract.getUtxoByTxHash(txHashToSearchFor);\n';
  code += 'const tx = await contract.withdrawFund(utxo);\n';
  code += 'const signedTx = await wallet.signTx(tx, true);\n';
  code += 'const txHash = await wallet.submitTx(signedTx);\n';

  return (
    <>
      <p>
        After the lockup period has expired, the beneficiary can withdraw the
        funds from the vesting contract. The code snippet below demonstrates how
        to withdraw funds from the vesting contract.
      </p>
      <p>
        This function, <code>withdrawFund()</code>, is used to withdraw funds
        from a vesting contract. The function accepts the following parameters:
      </p>
      <ul>
        <li>
          <b>vestingUtxo (UTxO)</b> - unspent transaction output in the script
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
    'mesh_vesting_demo',
    undefined
  );

  function getContract() {
    const blockchainProvider = new BlockfrostProvider(
      process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_PREPROD!
    );

    const meshTxBuilder = new MeshTxBuilder({
      fetcher: blockchainProvider,
      submitter: blockchainProvider,
    });

    const contract = new MeshVestingContract({
      mesh: meshTxBuilder,
      fetcher: blockchainProvider,
      wallet: wallet,
      networkId: 0,
    });

    return contract;
  }

  async function rundemo() {
    setLoading(true);
    setResponse(null);
    setResponseError(null);

    try {
      const contract = getContract();

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

  return (
    <Card>
      <p>
        For this demo, connect with the{' '}
        <Link href="https://meshjs.dev/apis/appwallet#loadWallet">wallet</Link>,
        to withdraw funds from the vesting contract.
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
