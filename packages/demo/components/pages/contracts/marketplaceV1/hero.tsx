import { ShoppingCartIcon } from '@heroicons/react/24/solid';
import { CardanoWallet, useWallet } from '@meshsdk/react';
import Button from '../../../ui/button';
import Card from '../../../ui/card';
import { useState } from 'react';
import RunDemoResult from '../../../common/runDemoResult';
import Codeblock from '../../../ui/codeblock';
import Link from 'next/link';
import mintMeshToken from '../../../common/mintMeshToken';

export default function Hero() {
  let codeInit = ``;
  codeInit += `import { BasicMarketplace } from '@meshsdk/contracts';\n`;
  codeInit += `import { KoiosProvider } from '@meshsdk/core';\n`;
  codeInit += `import { useWallet } from '@meshsdk/react';\n`;
  codeInit += `\n`;
  codeInit += `const blockchainProvider = new KoiosProvider('preprod');\n`;
  codeInit += `\n`;
  codeInit += `const { wallet } = useWallet();\n`;
  codeInit += `\n`;
  codeInit += `const marketplace = new BasicMarketplace({\n`;
  codeInit += `  fetcher: blockchainProvider,\n`;
  codeInit += `  initiator: wallet,\n`;
  codeInit += `  network: 'preprod',\n`;
  codeInit += `  signer: wallet,\n`;
  codeInit += `  submitter: blockchainProvider,\n`;
  codeInit += `  percentage: 25000, // 2.5%\n`;
  codeInit += `  owner: 'addr_test1vpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0c7e4cxr',\n`;
  codeInit += `});\n`;

  return (
    <>
      <header className="mb-4 lg:mb-6">
        <h2 className="mb-4 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
          <div className="flex items-center">
            <div className="p-2 mr-4">
              <ShoppingCartIcon className="w-16 h-16" />
            </div>
            <span>Marketplace</span>
          </div>
        </h2>
        <p className="mb-8 font-light text-gray-500 sm:text-xl dark:text-gray-400">
          This marketplace allows anyone to buy and sell native assets such as
          NFTs.
        </p>
      </header>
      <div className="grid grid-cols-1 px-4 lg:grid-cols-3 lg:gap-4 pb-16">
        <div className="col-span-2">
          <p>
            The marketplace smart contract allows users to buy and sell NFTs. A
            seller list an NFT for sales by specifying a certain price, and
            anyone can buy it by paying the demanded price.
          </p>
          <p>
            There are 4 actions (or endpoints) available to interact with this
            smart contract:
          </p>
          <ul>
            <li>list asset</li>
            <li>buy asset</li>
            <li>updating listing</li>
            <li>cancel listing</li>
          </ul>
          <p>
            Do check out the{' '}
            <Link href="/guides/custom-marketplace">guide</Link> and the{' '}
            <Link href="/starter-templates">marketplace starter kit</Link> that
            might help you get started. This contract is written in{' '}
            <a
              href="https://pluts.harmoniclabs.tech/"
              target="_blank"
              rel="noreferrer"
            >
              plu-ts
            </a>
            , you can{' '}
            <a
              href="https://github.com/MeshJS/mesh/blob/main/packages/contracts/src/marketplace/contract.ts"
              target="_blank"
              rel="noreferrer"
            >
              view the contract on GitHub
            </a>
            .
          </p>
        </div>
        <div className="col-span-2">
          <h3>Initialize the Marketplace</h3>
          <p>
            Utilizing the Marketplace contract requires a blockchain provider
            and a connected browser wallet. Here is an example how we can
            initialize the Marketplace.
          </p>
          <Codeblock data={codeInit} isJson={false} />
          <p>
            You can define the <code>fetcher</code> and <code>submitter</code>{' '}
            with one of our <Link href="/providers">blockchain providers</Link>{' '}
            or use your own custom provider. We use these <code>fetcher</code>{' '}
            and <code>submitter</code> to query for locked UTxO and submit
            transactions. The{' '}
            <Link href="/apis/browserwallet">connected wallet</Link> are defined
            in the <code>initiator</code> and <code>signer</code>. The network
            can defined in <code>network</code>, it has to be one of the
            following values:{' '}
            <code>"testnet" | "preview" | "preprod" | "mainnet"</code>
          </p>
          <p>
            The <code>owner</code> is the address of the marketplace owner which
            will receive the marketplace fee. The <code>percentage</code> is the
            percentage of the sale price that the marketplace <code>owner</code>{' '}
            will take. Note that, the fee numerator is in the order of millions,
            for example <code>3000</code> implies a fee of{' '}
            <code>3000/1_000_000</code> (or <code>0.003</code>) implies a fee of{' '}
            <code>0.3%</code>.
          </p>
        </div>
        <div className="col-span-2">
          <Demo />
        </div>
      </div>
    </>
  );
}

function Demo() {
  const { wallet, connected } = useWallet();
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);

  return (
    <Card>
      <h3>Try the demo</h3>
      <p>You can test this martetplace smart contract on this page.</p>
      <p>
        Firstly, switch your wallet network to one of the testnets, and connect
        wallet.
      </p>
      <CardanoWallet />
      {connected && (
        <>
          <p>Next, mint a Mesh Token. We will use list this NFT for sale.</p>
          <Button
            onClick={() => mintMeshToken({ setLoading, setResponse, wallet })}
            style={
              loading ? 'warning' : response !== null ? 'success' : 'light'
            }
            disabled={loading}
          >
            Mint Mesh Token
          </Button>
          {response !== null && (
            <>
              <p>Mesh token minted successful.</p>
              <RunDemoResult response={response} label="Transaction hash" />
            </>
          )}
        </>
      )}
    </Card>
  );
}
