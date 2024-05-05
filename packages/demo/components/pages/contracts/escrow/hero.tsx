import { ArrowsRightLeftIcon } from '@heroicons/react/24/solid';
import Codeblock from '../../../ui/codeblock';
import Link from 'next/link';

export default function Hero() {
  let code = ``;
  code += `import { BlockfrostProvider, MeshTxBuilder } from '@meshsdk/core';\n`;
  code += `import { MeshEscrowContract } from '@meshsdk/contracts';\n`;
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
  code += `const contract = new MeshEscrowContract({\n`;
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
            <span>Escrow</span>
          </div>
        </h2>
        <p className="mb-8 font-light text-gray-500 sm:text-xl dark:text-gray-400">
          Escrow contract facilitates the secure exchange of assets between two
          parties by acting as a trusted intermediary that holds the assets
          until the conditions of the agreement are met.
        </p>
      </header>
      <div className="grid grid-cols-1 px-4 lg:grid-cols-3 lg:gap-4 pb-16">
        <div className="col-span-2">
          <p>
            The escrow smart contract allows two parties to exchange assets
            securely. The contract holds the assets until both parties agree and
            sign off on the transaction.
          </p>
          <p>
            There are 4 actions available to interact with this smart contract:
          </p>
          <ul>
            <li>initiate escrow and deposit assets</li>
            <li>deposit assets</li>
            <li>complete escrow</li>
            <li>cancel escrow</li>
          </ul>
          <p>
            To initialize the escrow, we need to initialize a{' '}
            <Link href="/providers">provider</Link>, <code>MeshTxBuilder</code>{' '}
            and <code>MeshEscrowContract</code>.
          </p>
          <Codeblock data={code} isJson={false} />
          <p>
            Both on-chain and off-chain codes are open-source and available on{' '}
            <Link href="https://github.com/MeshJS/mesh/tree/main/packages/contracts/src/escrow">
              Mesh Github Repository
            </Link>
            .
          </p>
        </div>
      </div>
    </>
  );
}
