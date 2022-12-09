import { WalletIcon } from '@heroicons/react/24/solid';

export default function Hero() {
  let codeSnippet = '';
  codeSnippet += `// import BrowserWallet\n`;
  codeSnippet += `import { BrowserWallet } from '@meshsdk/core';\n\n`;
  codeSnippet += `// connect to a wallet\n`;
  codeSnippet += `const wallet = await BrowserWallet.enable('eternl');\n\n`;
  codeSnippet += `// get assets in wallet\n`;
  codeSnippet += `const assets = await wallet.getAssets();`;

  return (
    <>
      <header className="mb-4 lg:mb-6">
        <h2 className="mb-4 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
          <div className="flex items-center">
            <div className="p-2 mr-4">
              <WalletIcon className="w-16 h-16" />
            </div>
            <span>App Wallet</span>
          </div>
        </h2>
        <p className="mb-8 font-light text-gray-500 sm:text-xl dark:text-gray-400">
          Wallet for building transactions in your applications.
        </p>
      </header>
      <div className="grid grid-cols-1 px-4 lg:grid-cols-3 lg:gap-4 pb-16">
        <div className="col-span-2">
          <p>
            Whether you are building a minting script, or an application that
            requires multi-signature, <code>AppWallet</code> is all you need to
            get started.
          </p>

          <p className="font-medium">
            In this section, you will learn how to initialize a wallet and use it to sign
            transactions.
          </p>
        </div>
      </div>
    </>
  );
}
