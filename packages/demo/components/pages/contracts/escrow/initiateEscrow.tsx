import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../../../common/sectionTwoCol';
import Button from '../../../ui/button';
import { CardanoWallet, useWallet } from '@meshsdk/react';
import { useState } from 'react';
import RunDemoResult from '../../../common/runDemoResult';
import { Asset, BlockfrostProvider, MeshTxBuilder } from '@meshsdk/core';
import { MeshEscrowContract } from '@meshsdk/contracts';
import useLocalStorage from '../../../../hooks/useLocalStorage';

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
  let code = ``;
  code += `const contract = getContract();\n`;
  code += ` \n`;
  code += `const escrowAmount: Asset[] = [\n`;
  code += `  {\n`;
  code += `    unit: 'lovelace',\n`;
  code += `    quantity: '10000000',\n`;
  code += `  },\n`;
  code += `];\n`;
  code += `const networkId = 0;\n`;
  code += ` \n`;
  code += `// transaction\n`;
  code += `const tx = await contract.initiateEscrow(escrowAmount, networkId);\n`;
  code += `const signedTx = await wallet.signTx(tx);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);`;

  return (
    <>
      <p>An escrow is initiated by one of the party, user A.</p>
      <p>
        This function, `initiateEscrow()`, is used to initiate an escrow. The
        function accepts the following parameters:
      </p>
      <ul>
        <li>
          <b>escrowAmount (Asset[])</b> - a list of assets
        </li>
        <li>
          <b>networkId (number)</b> - blockchain network
        </li>
      </ul>
      <p>
        The function returns a transaction hex if the escrow is successfully
        initiated.
      </p>
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
      const contract = getContract();

      const escrowAmount: Asset[] = [
        {
          unit: 'lovelace',
          quantity: '10000000',
        },
      ];
      const networkId = 0;

      const tx = await contract.initiateEscrow(escrowAmount, networkId);

      const signedTx = await wallet.signTx(tx);
      const txHash = await wallet.submitTx(signedTx);
      setUserlocalStorage(txHash);
      setResponse(txHash);
    } catch (error) {
      setResponseError(`${error}`);
    }
    setLoading(false);
  }

  return (
    <Card>
      <p>This demo, wallet A initiate an escrow with 10 ADA.</p>
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
