import { BanknotesIcon } from '@heroicons/react/24/solid';
import Codeblock from '../../../ui/codeblock';

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
              <BanknotesIcon className="w-16 h-16" />
            </div>
            <span>Browser Wallet</span>
          </div>
        </h2>
        <p className="mb-8 font-light text-gray-500 sm:text-xl dark:text-gray-400">
          For connecting, queries and performs wallet functions in accordance to{' '}
          <a
            href="https://github.com/cardano-foundation/CIPs/tree/master/CIP-0030"
            target="_blank"
            rel="noreferrer"
          >
            CIP-30
          </a>
          .
        </p>
      </header>
      <div className="grid grid-cols-1 px-4 lg:grid-cols-3 lg:gap-4 pb-16">
        <div className="col-span-2">
          <p>
            These wallets APIs are in accordance to{' '}
            <a
              href="https://github.com/cardano-foundation/CIPs/tree/master/CIP-0030"
              target="_blank"
              rel="noreferrer"
            >
              CIP-30
            </a>
            , which defines the API for dApps to communicate with the user's
            wallet. Additional utility functions provided for developers that
            are useful for building dApps.
          </p>

          <p className="font-medium">
            In this section, you can connect wallet and try APIs for dApps to
            communicate with your wallet. To start, import BrowserWallet:
          </p>
          <Codeblock data={codeSnippet} isJson={false} />
        </div>
      </div>
    </>
    // <section className="bg-white dark:bg-gray-900">
    //   <div className="grid max-w-screen-xl px-4 py-8 mx-auto lg:gap-8 xl:gap-4 lg:py-16 lg:grid-cols-12">
    //     <div className="mr-auto place-self-center lg:col-span-6">
    //       <h1 className="max-w-2xl mb-4 text-4xl font-extrabold tracking-tight leading-none md:text-5xl xl:text-6xl dark:text-white">
    //         Browser Wallet
    //       </h1>
    //       <p className="max-w-2xl mb-6 lg:mb-8 md:text-lg lg:text-xl typography">
    //         For connecting, queries and performs wallet functions. These wallets
    //         APIs are in accordance to{' '}
    //         <a
    //           href="https://github.com/cardano-foundation/CIPs/tree/master/CIP-0030"
    //           target="_blank"
    //           rel="noreferrer"
    //         >
    //           CIP-30
    //         </a>
    //         , which defines the API for dApps to communicate with the user's
    //         wallet. Additional utility functions provided for developers that
    //         are useful for building dApps.
    //       </p>
    //     </div>
    //     <div className="hidden lg:mt-0 lg:col-span-5 lg:flex">
    //       <Codeblock data={codeSnippet} isJson={false} />
    //     </div>
    //   </div>
    // </section>
  );
}
