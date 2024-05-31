import { ArrowsRightLeftIcon } from '@heroicons/react/24/solid';
import Link from 'next/link';
import Codeblock from '../../../ui/codeblock';
import Button from '../../../ui/button';
import MintMeshToken from '../../../common/mintMeshToken';

export default function Hero() {
  let code = ``;
  code += `import { BlockfrostProvider, MeshTxBuilder } from '@meshsdk/core';\n`;
  code += `import { MeshSwapContract } from '@meshsdk/contracts';\n`;
  code += `import { useWallet } from '@meshsdk/react';\n`;
  code += `\n`;
  code += `const { connected, wallet } = useWallet();\n`;
  code += `\n`;
  code += `const blockchainProvider = new BlockfrostProvider(APIKEY);\n`;
  code += `\n`;
  code += `const meshTxBuilder = new MeshTxBuilder({\n`;
  code += `  fetcher: blockchainProvider,\n`;
  code += `  submitter: blockchainProvider,\n`;
  code += `});\n`;
  code += `\n`;
  code += `const contract = new MeshSwapContract({\n`;
  code += `  mesh: meshTxBuilder,\n`;
  code += `  fetcher: blockchainProvider,\n`;
  code += `  wallet: wallet,\n`;
  code += `  networkId: 0,\n`;
  code += `});\n`;

  return (
    <>
      <header className="mb-4 lg:mb-6">
        <h2 className="mb-4 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
          <div className="flex items-center">
            <div className="p-2 mr-4">
              <ArrowsRightLeftIcon className="w-16 h-16" />
            </div>
            <span>Swap</span>
          </div>
        </h2>
        <p className="mb-8 font-light text-gray-500 sm:text-xl dark:text-gray-400">
          Swap contract facilitates the exchange of assets between two parties.
        </p>
      </header>
      <div className="grid grid-cols-1 px-4 lg:grid-cols-3 lg:gap-4 pb-16">
        <div className="col-span-2">
          <p>
            Swap contract facilitates the exchange of assets between two
            parties. This contract is designed to be used in a peer-to-peer
            exchange scenario where two parties agree to exchange assets. The
            contract ensures that the assets are locked up until it is accepted
            by the other party. At any point before it is accepted, one can
            cancel the swap to retrieve the assets.
          </p>
          <p>
            There are 2 actions (or endpoints) available to interact with this
            smart contract:
          </p>
          <ul>
            <li>initiate swap</li>
            <li>accept asset</li>
            <li>cancel swap</li>
          </ul>
          <p>
            To initialize the swap, we need to initialize a{' '}
            <Link href="/providers">provider</Link>, <code>MeshTxBuilder</code>{' '}
            and <code>MeshSwapContract</code>.
          </p>
          <Codeblock data={code} isJson={false} />
          <p>
            Both on-chain and off-chain codes are open-source and available on{' '}
            <Link href="https://github.com/MeshJS/mesh/tree/main/packages/contracts/src/swap">
              Mesh Github Repository
            </Link>
            .
          </p>
          <p>
            You may need to mint some Mesh Token to interact with this demo.
            Connect your wallet and click the button below to mint a Mesh Token.
          </p>
          <MintMeshToken />
        </div>
      </div>
    </>
  );
}
