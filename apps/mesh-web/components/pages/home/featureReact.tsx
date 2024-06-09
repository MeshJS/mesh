import { ChevronRightIcon } from '@heroicons/react/24/solid';
import Link from 'next/link';
import Card from '../../ui/card';
import { CardanoWallet } from '@meshsdk/react';
import Codeblock from '../../ui/codeblock';

export default function FeatureReact() {
  let code1 = `import { CardanoWallet } from '@meshsdk/react';\n\n`;
  code1 += `export default function Page() {\n`;
  code1 += `  return (\n`;
  code1 += `    <>\n`;
  code1 += `      <CardanoWallet />\n`;
  code1 += `    </>\n`;
  code1 += `  );\n`;
  code1 += `}\n`;

  return (
    <section className="bg-white dark:bg-gray-900">
      <div className="gap-8 items-center py-8 px-4 mx-auto max-w-screen-xl xl:gap-16 md:grid md:grid-cols-2 sm:py-16 lg:px-6 format dark:format-invert">
        <div className="mt-4 md:mt-0">
          <h2 className="mb-4 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
            React Components
          </h2>
          <p className="mb-6 font-light text-gray-500 md:text-lg dark:text-gray-400">
            Frontend components and useful React hooks, Mesh provides everything
            you need to bring your Web3 user interface to life.
          </p>
          <Link href="/react">
            <div className="inline-flex items-center justify-center px-5 py-3 mr-3 text-base font-medium text-center text-white rounded-lg bg-primary-700 hover:bg-primary-800 focus:ring-4 focus:ring-primary-300 dark:focus:ring-primary-900 cursor-pointer">
              Learn more about React components
              <ChevronRightIcon className="ml-2 -mr-1 w-5 h-5" />
            </div>
          </Link>
        </div>
        <Card>
          <h3>Connect Wallet</h3>
          <p>
            Import <code>CardanoWallet</code> to allow the user to select a
            wallet to connect to your dApp.
          </p>
          <Codeblock data={code1} isJson={false} />
          <CardanoWallet />
        </Card>
      </div>
    </section>
  );
}
