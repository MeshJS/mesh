import { PuzzlePieceIcon } from '@heroicons/react/24/solid';
import Codeblock from '../../../ui/codeblock';

export default function Hero() {
  let codeSnippet = '';
  codeSnippet += `// import Transaction and BrowserWallet\n`;
  codeSnippet += `import { Transaction, BrowserWallet } from '@meshsdk/core';\n\n`;
  codeSnippet += `// connect to a wallet\n`;
  codeSnippet += `const wallet = await BrowserWallet.enable('eternl');\n\n`;
  codeSnippet += `// initiate a new Transaction with the connected wallet\n`;
  codeSnippet += `const tx = new Transaction({ initiator: wallet });`;

  return (
    <>
      <header className="mb-4 lg:mb-6">
        <h2 className="mb-4 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
          <div className="flex items-center">
            <div className="p-2 mr-4">
              <PuzzlePieceIcon className="w-16 h-16" />
            </div>
            <span>Transaction</span>
          </div>
        </h2>
        <p className="mb-8 font-light text-gray-500 sm:text-xl dark:text-gray-400">
          Build transactions, minting native assets, and redeem from smart
          contract.
        </p>
      </header>
      <div className="grid grid-cols-1 px-4 lg:grid-cols-3 lg:gap-4 pb-16">
        <div className="col-span-2">
          <p>
            With Mesh, you can chain to create complex transactions. You can
            send ADA and NFTS to multiple addresses, lock and unlock from smart
            contract, all with a single transaction.
          </p>
          <p className="font-medium">
            In this section, let's create some transactions with Mesh. We need
            the following to create a transaction:
          </p>
          <Codeblock data={codeSnippet} isJson={false} />
        </div>
      </div>
    </>
  );
}
