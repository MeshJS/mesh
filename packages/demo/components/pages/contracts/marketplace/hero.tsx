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
  codeInit += `import { MeshMarketplaceContract } from '@meshsdk/contracts';\n`;
  codeInit += `import { BlockfrostProvider, MeshTxBuilder } from '@meshsdk/core';\n`;
  codeInit += `\n`;
  codeInit += `const blockchainProvider = new BlockfrostProvider(APIKEY);\n`;
  codeInit += `\n`;
  codeInit += `const meshTxBuilder = new MeshTxBuilder({\n`;
  codeInit += `  fetcher: blockchainProvider,\n`;
  codeInit += `  submitter: blockchainProvider,\n`;
  codeInit += `});\n`;
  codeInit += `\n`;
  codeInit += `const contract = new MeshMarketplaceContract(\n`;
  codeInit += `  {\n`;
  codeInit += `    mesh: meshTxBuilder,\n`;
  codeInit += `    fetcher: blockchainProvider,\n`;
  codeInit += `    wallet: wallet,\n`;
  codeInit += `    networkId: 0,\n`;
  codeInit += `  },\n`;
  codeInit += `  'addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv06fwlvuacpyv59g3a3w2fhk7daa8aepvacnpamyhyyxrgnscrfpsa',\n`;
  codeInit += `  200\n`;
  codeInit += `);\n`;

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
            To initialize the Marketplace, we import the{' '}
            <code>MeshMarketplaceContract</code>. The first JSON object is the{' '}
            <code>inputs</code> for the <code>MeshTxInitiatorInput</code>, this
            requires a <code>MeshTxBuilder</code>, a <code>Provider</code>, a{' '}
            <code>Wallet</code>, and define the network ID.
          </p>
          <p>
            Second and third parameters are the <code>ownerAddress</code> and{' '}
            <code>feePercentageBasisPoint</code>. The <code>ownerAddress</code>{' '}
            is the address of the marketplace owner which will receive the
            marketplace fee. The <code>feePercentageBasisPoint</code> is the
            percentage of the sale price that the marketplace <code>owner</code>{' '}
            will take. The fee numerator is in the order of hundreds, for
            example <code>200</code> implies a fee of <code>2%</code>.
          </p>
          <p>
            Both on-chain and off-chain codes are open-source and available on{' '}
            <Link href="https://github.com/MeshJS/mesh/tree/main/packages/contracts/src/marketplace">
              Mesh Github Repository
            </Link>
            .
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
      <h3>Mint a token to try the demo</h3>
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
