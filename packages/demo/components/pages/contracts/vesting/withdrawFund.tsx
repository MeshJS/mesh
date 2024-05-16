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
import { MeshWallet, BlockfrostProvider } from '@meshsdk/core';

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
        <code>withdrawFund()</code> withdraw funds from a vesting contract. The
        function accepts the following parameters:
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
      // wallet

      const blockchainProvider = new BlockfrostProvider(
        process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_PREPROD!
      );

      const wallet = new MeshWallet({
        networkId: 0,
        fetcher: blockchainProvider,
        submitter: blockchainProvider,
        key: {
          type: 'mnemonic',
          words: [
            'solution',
            'solution',
            'solution',
            'solution',
            'solution',
            'solution',
            'solution',
            'solution',
            'solution',
            'solution',
            'solution',
            'solution',
            'solution',
            'solution',
            'solution',
            'solution',
            'solution',
            'solution',
            'solution',
            'solution',
            'solution',
            'solution',
            'solution',
            'solution',
          ],
        },
      });

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
        For this demo, we withdraw funds from the vesting contract with{' '}
        <Link href="https://meshjs.dev/apis/meshwallet#initWallet">
          Mesh's "solution" wallet
        </Link>
        , the recipient of this vesting demo.
      </p>
      <Codeblock data={code} isJson={false} />

      <Button
        onClick={() => rundemo()}
        style={loading ? 'warning' : response !== null ? 'success' : 'light'}
        disabled={loading}
      >
        Withdraw Fund
      </Button>
      <RunDemoResult response={response} />

      <RunDemoResult response={responseError} label="Error" />
    </Card>
  );
}
