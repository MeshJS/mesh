import { ChevronRightIcon } from '@heroicons/react/24/solid';
import Link from 'next/link';
import Card from '../../ui/card';
import Codeblock from '../../ui/codeblock';

export default function FeatureProviders() {
  let code1 = ``;
  code1 += `import { KoiosProvider } from '@meshsdk/core';\n\n`;
  code1 += `const koios = new KoiosProvider('api');\n`;
  code1 += `await koios.fetchAssetAddress('assetunithere');`;

  return (
    <section className="bg-white dark:bg-gray-900">
      <div className="gap-8 items-center py-8 px-4 mx-auto max-w-screen-xl xl:gap-16 md:grid md:grid-cols-2 sm:py-16 lg:px-6 format dark:format-invert">
        <div className="mt-4 md:mt-0">
          <h2 className="mb-4 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
            Integrate with Services
          </h2>
          <p className="mb-6 font-light text-gray-500 md:text-lg dark:text-gray-400">
            Choose between{' '}
            <a href="https://blockfrost.io/" target="_blank" rel="noreferrer">
              Blockfrost
            </a>
            ,{' '}
            <a href="https://tangocrypto.com/" target="_blank" rel="noreferrer">
              Tangocrypto
            </a>
            , or{' '}
            <a href="https://www.koios.rest/" target="_blank" rel="noreferrer">
              Koios
            </a>{' '}
            to access blockchain data. Query{' '}
            <a href="https://adahandle.com/" target="_blank" rel="noreferrer">
              ADA Handle
            </a>{' '}
            to get wallet's address. And more to come.
          </p>
          <Link href="/providers">
            <div className="inline-flex items-center justify-center px-5 py-3 mr-3 text-base font-medium text-center text-white rounded-lg bg-primary-700 hover:bg-primary-800 focus:ring-4 focus:ring-primary-300 dark:focus:ring-primary-900 cursor-pointer">
              See providers
              <ChevronRightIcon className="ml-2 -mr-1 w-5 h-5" />
            </div>
          </Link>
        </div>
        <Card>
          <h3>Blockchain Data Provider</h3>
          <p>
            You can import one of the providers, Mesh use it to query for
            blockchain data for transaction building.
          </p>
          <Codeblock data={code1} isJson={false} />
        </Card>
      </div>
    </section>
  );
}
