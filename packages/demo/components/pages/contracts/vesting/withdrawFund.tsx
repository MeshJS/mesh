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

  return (
    <>
      <p></p>
      <Codeblock data={code} isJson={false} />
    </>
  );
}

function Right() {
  const { connected, wallet } = useWallet();
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);

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
    });

    return contract;
  }

  async function rundemo() {
    setLoading(true);
    setResponse(null);
    setResponseError(null);

    try {
      const contract = getContract();

      // get script address

      const script: PlutusScript = {
        code: contract.scriptCbor,
        version: 'V2',
      };
      const scriptAddress = resolvePlutusScriptAddress(script, 0);
      console.log(3, scriptAddress);

      // get utxo from script

      const blockchainProvider = new BlockfrostProvider(
        process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_PREPROD!
      );

      const utxos = await blockchainProvider.fetchAddressUTxOs(
        scriptAddress,
        'lovelace'
      );
      console.log(4, utxos);

      const vestingUtxo = utxos[7]; // change this to the correct index
      console.log(5, vestingUtxo);

      if (!vestingUtxo) {
        setResponseError('No vesting utxo found');
        return;
      }
      
      // withdraw

      const tx = await contract.withdrawFund(vestingUtxo, 0);
      console.log('tx', tx);

      const signedTx = await wallet.signTx(tx, true);
      console.log('signedTx', signedTx);
      const txHash = await wallet.submitTx(signedTx);
      console.log('txHash', txHash);
      setResponse(txHash);
    } catch (error) {
      setResponseError(`${error}`);
    }
    setLoading(false);
  }

  return (
    <Card>
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
