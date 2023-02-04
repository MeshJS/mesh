import { useEffect, useState } from 'react';
import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../../../common/sectionTwoCol';
import RunDemoButton from '../../../common/runDemoButton';
import RunDemoResult from '../../../common/runDemoResult';
import { Transaction, ForgeScript } from '@meshsdk/core';
import type { Mint, AssetMetadata } from '@meshsdk/core';
import useAppWallet from '../../../../contexts/appWallet';
import { demoAddresses } from '../../../../configs/demo';
import Input from '../../../ui/input';
import Link from 'next/link';

export default function SignTx() {
  const [address, setAddress] = useState<string>(demoAddresses.testnet);

  return (
    <SectionTwoCol
      sidebarTo="signTx"
      header="Create & sign transactions"
      leftFn={Left(address)}
      rightFn={Right(address, setAddress)}
    />
  );
}

function Left(address) {
  let code1 = '';
  code1 += `import { Transaction, ForgeScript } from '@meshsdk/core';\n`;
  code1 += `import type { Mint, AssetMetadata } from '@meshsdk/core';\n`;
  code1 += `\n`;
  code1 += `const walletAddress = wallet.getPaymentAddress();\n`;
  code1 += `const forgingScript = ForgeScript.withOneSignature(walletAddress);\n`;
  code1 += `\n`;
  code1 += `const assetMetadata1: AssetMetadata = {\n`;
  code1 += `  name: 'Mesh Token',\n`;
  code1 += `  image: 'ipfs://QmRzicpReutwCkM6aotuKjErFCUD213DpwPq6ByuzMJaua',\n`;
  code1 += `  mediaType: 'image/jpg',\n`;
  code1 += `  description: 'This NFT is minted by Mesh (https://meshjs.dev/).',\n`;
  code1 += `};\n`;
  code1 += `const asset1: Mint = {\n`;
  code1 += `  assetName: 'MeshToken',\n`;
  code1 += `  assetQuantity: '1',\n`;
  code1 += `  metadata: assetMetadata1,\n`;
  code1 += `  label: '721',\n`;
  code1 += `  recipient: '${address}'\n`;
  code1 += `};\n`;
  code1 += `\n`;
  code1 += `const tx = new Transaction({ initiator: wallet });\n`;
  code1 += `tx.mintAsset(forgingScript, asset1);\n`;
  code1 += `\n`;
  code1 += `const unsignedTx = await tx.build();\n`;
  code1 += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  code1 += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <>
      <p>
        We can create transactions and sign it with the wallet. For this demo,
        we will mint an asset and send it to an address. Go to{' '}
        <Link href="/apis/transaction">Transaction</Link> to learn more about
        building transactions.
      </p>
      <Codeblock data={code1} isJson={false} />
    </>
  );
}

function Right(address, setAddress) {
  const { wallet, walletNetwork, walletConnected } = useAppWallet();
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);

  useEffect(() => {
    async function init() {
      if (walletNetwork == 0) {
        setAddress(demoAddresses.testnet);
      }
      if (walletNetwork == 1) {
        setAddress(demoAddresses.mainnet);
      }
    }
    if (walletConnected) {
      init();
    }
  }, [walletConnected]);

  async function runDemo() {
    setLoading(true);

    try {
      const walletAddress = wallet.getPaymentAddress();
      const forgingScript = ForgeScript.withOneSignature(walletAddress);

      const assetMetadata1: AssetMetadata = {
        name: 'Mesh Token',
        image: 'ipfs://QmRzicpReutwCkM6aotuKjErFCUD213DpwPq6ByuzMJaua',
        mediaType: 'image/jpg',
        description: 'This NFT is minted by Mesh (https://meshjs.dev/).',
      };
      const asset1: Mint = {
        assetName: 'MeshToken',
        assetQuantity: '1',
        metadata: assetMetadata1,
        label: '721',
        recipient: {
          address: address,
        },
      };

      const tx = new Transaction({ initiator: wallet });
      tx.mintAsset(forgingScript, asset1);

      const unsignedTx = await tx.build();
      const signedTx = await wallet.signTx(unsignedTx);
      const txHash = await wallet.submitTx(signedTx);

      setResponse(txHash);
    } catch (error) {
      setResponseError(JSON.stringify(error));
    }
    setLoading(false);
  }

  return (
    <>
      <Card>
        <InputTable address={address} setAddress={setAddress} />
        {!walletConnected && <p>Load a wallet to try this endpoint.</p>}
        <RunDemoButton
          runDemoFn={runDemo}
          loading={loading}
          response={response}
          label="Create minting transaction, sign and submit"
          disabled={!walletConnected}
        />
        <RunDemoResult response={response} />
        <RunDemoResult response={responseError} label="Error" />
      </Card>
    </>
  );
}

function InputTable({ address, setAddress }) {
  return (
    <div className="overflow-x-auto relative">
      <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400 m-0">
        <caption className="p-5 text-lg font-semibold text-left text-gray-900 bg-white dark:text-white dark:bg-gray-800">
          Create a transaction to mint asset
          <p className="mt-1 text-sm font-normal text-gray-500 dark:text-gray-400">
            Define the address to send minted assets to.
          </p>
        </caption>
        <tbody>
          <tr className="bg-white border-b dark:bg-gray-800 dark:border-gray-700">
            <td>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Send minted asset to address"
                label="Send minted asset to address"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
