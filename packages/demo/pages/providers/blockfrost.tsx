import { useState, useEffect } from 'react';
import CommonLayout from '../../components/common/layout';
import Metatags from '../../components/site/metatags';
import Codeblock from '../../components/ui/codeblock';
import {
  BadgeFetcher,
  BadgeSubmitter,
} from '../../components/pages/providers/badges';
import Fetcher from '../../components/pages/providers/fetcher';
import { BlockfrostProvider } from '@meshsdk/core';
import Submitter from '../../components/pages/providers/submitter';

export default function ProvidersBlockfrost() {
  const sidebarItems = [
    { label: 'fetchProtocolParameters', to: 'fetchProtocolParameters' },
    { label: 'fetchAddressUtxos', to: 'fetchAddressUtxos' },
    { label: 'fetchAccountInfo', to: 'fetchAccountInfo' },
    // { label: 'fetchAssetMetadata', to: 'fetchAssetMetadata' },
    { label: 'submitTx', to: 'submitTx' },
  ];

  return (
    <>
      <Metatags
        title="Blockfrost Provider"
        description="Accessing and processing information stored on the blockchain"
      />
      <CommonLayout sidebarItems={sidebarItems}>
        <Hero />
        <Main />
      </CommonLayout>
    </>
  );
}

function Hero() {
  let code1 = `const blockfrostProvider = new BlockfrostProvider('<BLOCKFROST_API_KEY>');\n`;
  return (
    <header className="mb-4 lg:mb-6">
      <h2 className="mb-4 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
        Blockfrost
        <span className="ml-2">
          <BadgeFetcher />
          <BadgeSubmitter />
        </span>
      </h2>
      <p className="mb-8 font-light text-gray-500 sm:text-xl dark:text-gray-400">
        Accessing and processing information stored on the blockchain
      </p>

      <div className="grid grid-cols-1 px-4 lg:grid-cols-2 lg:gap-16 pb-16">
        <div className="col-span-1 xl:col-auto">
          <p>
            <a href="https://blockfrost.io/" target="_blank" rel="noreferrer">
              Blockfrost
            </a>{' '}
            provides restful APIs which allows your app to access information
            stored on the blockchain.
          </p>
          <p>Get started:</p>
          <Codeblock data={code1} isJson={false} />
        </div>
        <div className="col-span-1"></div>
      </div>
    </header>
  );
}

function Main() {
  const [blockfrostProvider, setBlockfrostProvider] =
    useState<BlockfrostProvider | null>(null);

  useEffect(() => {
    async function load() {
      const _blockfrostProvider = new BlockfrostProvider(
        process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_PREPROD!
      );
      setBlockfrostProvider(_blockfrostProvider);
    }
    load();
  }, []);

  return (
    <>
      <Fetcher fetcher={blockfrostProvider} fetcherName="blockfrostProvider" />
      <Submitter
        submitter={blockfrostProvider}
        submitterName="blockfrostProvider"
      />
    </>
  );
}
