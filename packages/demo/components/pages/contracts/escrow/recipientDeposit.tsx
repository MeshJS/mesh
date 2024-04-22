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
  MeshTxBuilder,
  PlutusScript,
  resolvePlutusScriptAddress,
} from '@meshsdk/core';
import { MeshEscrowContract } from '@meshsdk/contracts';

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

    const contract = new MeshEscrowContract({
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
      const networkId = 0;
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
        scriptAddress
        // 'lovelace'
      );
      console.log(4, utxos);

      const utxo = utxos[0]; // change this to the correct index
      console.log(5, utxo);

      if (!utxo) {
        setResponseError('No utxo found');
        return;
      }

      const depositAmount: Asset[] = [
        {
          unit: '0ba402c042775dfffedbd958cae3805a281bad34f46b5b6fd5c2c7714d657368546f6b656e',
          quantity: '1',
        },
      ];

      const tx = await contract.recipientDeposit(
        utxo,
        depositAmount,
        networkId
      );

      const signedTx = await wallet.signTx(tx, true);
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
