import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../../../common/sectionTwoCol';
import Button from '../../../ui/button';
import { CardanoWallet, useWallet } from '@meshsdk/react';
import { useState } from 'react';
import RunDemoResult from '../../../common/runDemoResult';
import {
  BlockfrostProvider,
  MeshTxBuilder,
  PlutusScript,
  resolvePlutusScriptAddress,
} from '@meshsdk/core';
import { MeshEscrowContract } from '@meshsdk/contracts';
import useLocalStorage from '../../../../hooks/useLocalStorage';

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
  code += `const networkId = 0;\n`;
  code += `const contract = getContract();\n`;
  code += `\n`;
  code += `// get script address\n`;
  code += `const script: PlutusScript = {\n`;
  code += `  code: contract.scriptCbor,\n`;
  code += `  version: 'V2',\n`;
  code += `};\n`;
  code += `const scriptAddress = resolvePlutusScriptAddress(script, networkId);\n`;
  code += `\n`;
  code += `// get utxo from script\n`;
  code += `const blockchainProvider = new BlockfrostProvider(\n`;
  code += `  BLOCKFROST_API_KEY_PREPROD\n`;
  code += `);\n`;
  code += `const utxos = await blockchainProvider.fetchAddressUTxOs(\n`;
  code += `  scriptAddress\n`;
  code += `);\n`;
  code += `const utxo = utxos[0]; // pick the correct utxo\n`;
  code += `\n`;
  code += `// transaction\n`;
  code += `const tx = await contract.cancelEscrow(utxo, networkId);\n`;
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
        <li>
          <b>networkId (number)</b> - blockchain network
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

      // get utxo from script

      const blockchainProvider = new BlockfrostProvider(
        process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_PREPROD!
      );

      const utxos = await blockchainProvider.fetchAddressUTxOs(scriptAddress);

      const utxo = utxos.filter(
        (utxo) => utxo.input.txHash === userLocalStorage
      )[0];

      if (!utxo) {
        setResponseError('No utxo found');
        setLoading(false);
        return;
      }

      const tx = await contract.cancelEscrow(utxo, networkId);

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
