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

export default function EscrowComplete() {
  return (
    <>
      <SectionTwoCol
        sidebarTo="completeEscrow"
        header="Complete Escrow"
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
  code += `const scriptAddress = resolvePlutusScriptAddress(script, 0);\n`;
  code += `\n`;
  code += `// get utxo from script\n`;
  code += `const blockchainProvider = new BlockfrostProvider(\n`;
  code += `  process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_PREPROD!\n`;
  code += `);\n`;
  code += `const utxos = await blockchainProvider.fetchAddressUTxOs(\n`;
  code += `  scriptAddress\n`;
  code += `);\n`;
  code += `const utxo = utxos.filter(\n`;
  code += `  (utxo) => utxo.input.txHash === txHashToSearchFor\n`;
  code += `)[0];\n`;
  code += `\n`;
  code += `// transaction\n`;
  code += `const tx = await contract.completeEscrow(utxo, networkId);\n`;
  code += `const signedTxUserA = await wallet.signTx(tx, true);\n`;

  let code2 = ``;
  code2 += `const signedTxUserB = await wallet.signTx(signedTxUserA, true);\n`;
  code2 += `const txHash = await wallet.submitTx(signedTxUserB);\n`;

  return (
    <>
      <p>
        A user can complete an escrow if the terms of the agreement are met. The
        completion can be initiated by any recipient of the escrow.
      </p>
      <p>
        This function, `completeEscrow()`, is used to complete an escrow. The
        function accepts the following parameters:
      </p>
      <ul>
        <li>
          <b>escrowUtxo (UTxO)</b> - the utxo of the transaction in the script
          to be completed
        </li>
        <li>
          <b>networkId (number)</b> - blockchain network
        </li>
      </ul>
      <p>
        <b>
          Important: Both users must sign the transaction to complete the
          escrow.
        </b>
      </p>
      <p>
        User A completes the escrow by calling the `completeEscrow()` function.
      </p>
      <Codeblock data={code} isJson={false} />
      <p>
        User B signs the transaction and submits it to the blockchain to
        complete the escrow.
      </p>
      <Codeblock data={code2} isJson={false} />
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
  const [userLocalStorage_tx, setUserlocalStorage_tx] = useLocalStorage(
    'mesh_escrow_demo_tx',
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

      const utxo = await contract.getUtxoByTxHash(userLocalStorage);

      if (!utxo) {
        setResponseError('No utxo found');
        return;
      }

      const tx = await contract.completeEscrow(utxo);

      const signedTx = await wallet.signTx(tx, true);
      setUserlocalStorage_tx(signedTx);
    } catch (error) {
      setResponseError(`${error}`);
    }
    setLoading(false);
  }

  async function rundemo2() {
    setLoading(true);
    setResponse(null);
    setResponseError(null);
    try {
      const tx = userLocalStorage_tx;
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
          This is a multi-signature transaction. After the recipient has
          deposited the assets, this final transaction requires both signatures.
        </p>
        <p>
          In this demo, you can connect with one of the wallet to sign
          transaction. Then connect with another wallet, refresh this page, and
          complete the escrow.
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
              Sign Transaction
            </Button>
            <Button
              onClick={() => rundemo2()}
              style={
                loading ? 'warning' : response !== null ? 'success' : 'light'
              }
              disabled={loading || userLocalStorage_tx === undefined}
            >
              Complete Escrow
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
