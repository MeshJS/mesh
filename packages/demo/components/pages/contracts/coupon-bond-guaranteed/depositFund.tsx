import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../../../common/sectionTwoCol';
import Button from '../../../ui/button';
import { CardanoWallet, useWallet } from '@meshsdk/react';
import { useState } from 'react';
import RunDemoResult from '../../../common/runDemoResult';
import { Asset, BlockfrostProvider, MeshTxBuilder } from '@meshsdk/core';
import { MeshVestingContract } from '@meshsdk/contracts';

export default function VestingDepositFund() {
  return (
    <>
      <SectionTwoCol
        sidebarTo="depositFund"
        header="Deposit Fund"
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

      const asset: Asset = {
        unit: 'lovelace',
        quantity: '4000000',
      };

      const lockUntilTimeStamp = new Date();
      lockUntilTimeStamp.setMinutes(lockUntilTimeStamp.getMinutes() + 2);

      const beneficiary =
        'addr_test1qqnnkc56unmkntvza0x70y65s3fs5awdpks7wpr4yu0mqm5vldqg2n2p8y4kyjm8sqfyg0tpq9042atz0fr8c3grjmys2gv2h5';

      const tx = await contract.depositFund(
        [asset],
        lockUntilTimeStamp.getTime(),
        beneficiary
      );
      console.log('tx', tx);

      const signedTx = await wallet.signTx(tx);
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
