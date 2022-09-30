import { useEffect, useState } from 'react';
import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../common/sectionTwoCol';
import RunDemoButton from '../common/runDemoButton';
import RunDemoResult from '../common/runDemoResult';
import {
  Transaction,
  BlockfrostProvider,
  ForgeScript,
} from '@martifylabs/mesh';
import type { Mint, AssetMetadata } from '@martifylabs/mesh';
import useNodeWallet from '../../../../contexts/nodewallet';
import { demoAddresses } from '../../../../configs/demo';
import Input from '../../../ui/input';
import Link from 'next/link';

export default function SignTx() {
  return (
    <SectionTwoCol
      sidebarTo="signTx"
      header="Create & sign transactions"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        We can create transactions and sign it with the wallet. For this demo,
        we will mint an asset and send it to an address. Go to{' '}
        <Link href="/apis/transaction">Transaction</Link> to learn more about
        building transactions.
      </p>
      <Codeblock
        data={``}
        isJson={false}
      />
    </>
  );
}

function Right() {
  const { wallet, walletNetwork, walletConnected } = useNodeWallet();
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);
  const [address, setAddress] = useState<string>(demoAddresses.testnet);

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
      const fetcherProvider = new BlockfrostProvider(
        process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_PREPROD!,
        walletNetwork
      );

      const address = wallet.getPaymentAddress();
      const forgingScript = ForgeScript.withOneSignature(address);

      const assetMetadata1: AssetMetadata = {
        name: 'Mesh Token',
        image: 'ipfs://QmRzicpReutwCkM6aotuKjErFCUD213DpwPq6ByuzMJaua',
        mediaType: 'image/jpg',
        description: 'This NFT is minted by Mesh (https://mesh.martify.io/).',
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
      const signedTx = await wallet.signTx(unsignedTx, false);
      const txHash = await fetcherProvider.submitTx(signedTx);

      setResponse(txHash);
    } catch (error) {
      setResponseError(`${error}`);
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
        {responseError !== null && (
          <>
            <p>
              <b>Result:</b>
            </p>
            <Codeblock data={responseError} />
          </>
        )}
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
