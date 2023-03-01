import { ChevronRightIcon } from '@heroicons/react/24/solid';
import Link from 'next/link';
import Card from '../../ui/card';
import Codeblock from '../../ui/codeblock';

export default function FeatureWallet() {
  let code1 = ``;
  code1 += `import { AppWallet } from '@meshsdk/core';\n\n`;
  code1 += `const wallet = new AppWallet({\n`;
  code1 += `  ...\n`;
  code1 += `  key: {\n`;
  code1 += `    type: 'cli',\n`;
  code1 += `    payment: 'CLIGeneratedPaymentCborHexHere',\n`;
  code1 += `    stake: 'optionalCLIGeneratedStakeCborHexHere',\n`;
  code1 += `  },\n`;
  code1 += `});\n`;

  return (
    <section className="bg-white dark:bg-gray-900">
      <div className="gap-8 items-center py-8 px-4 mx-auto max-w-screen-xl xl:gap-16 md:grid md:grid-cols-2 sm:py-16 lg:px-6 format dark:format-invert">
        <div className="mt-4 md:mt-0">
          <h2 className="mb-4 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
            Wallets Integrations
          </h2>
          <p className="mb-6 font-light text-gray-500 md:text-lg dark:text-gray-400">
            Mesh's transactions builder is compatible with many wallets;{' '}
            <code>cardano-cli</code> generated wallets, seed phrases or private
            key, or connect to client's CIP wallets.
          </p>
          <Link href="/apis/appwallet">
            <div className="inline-flex items-center justify-center px-5 py-3 mr-3 text-base font-medium text-center text-white rounded-lg bg-primary-700 hover:bg-primary-800 focus:ring-4 focus:ring-primary-300 dark:focus:ring-primary-900 cursor-pointer">
              Learn about wallets
              <ChevronRightIcon className="ml-2 -mr-1 w-5 h-5" />
            </div>
          </Link>
        </div>
        <Card>
          <h3>Import Existing Wallets</h3>
          <p>
            Import your <code>cardano-cli</code> generated wallets, and use it
            to mint your NFT collection on your Web3 website!
          </p>
          <Codeblock data={code1} isJson={false} />
        </Card>
      </div>
    </section>
  );
}
