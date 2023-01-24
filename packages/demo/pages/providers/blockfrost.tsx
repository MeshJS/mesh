import { useState, useEffect } from 'react';
import CommonLayout from '../../components/common/layout';
import Metatags from '../../components/site/metatags';
import Codeblock from '../../components/ui/codeblock';
import {
  BadgeFetcher,
  BadgeListener,
  BadgeSubmitter,
} from '../../components/pages/providers/badges';
import Fetcher from '../../components/pages/providers/fetcher';
import { BlockfrostProvider } from '@meshsdk/core';
import Submitter from '../../components/pages/providers/submitter';
import ButtonGroup from '../../components/ui/buttongroup';
import Listener from '../../components/pages/providers/listener';

export default function ProvidersBlockfrost() {
  const sidebarItems = [
    { label: 'Fetch Account Info', to: 'fetchAccountInfo' },
    { label: 'Fetch Address Utxos', to: 'fetchAddressUtxos' },
    { label: 'Fetch Asset Addresses', to: 'fetchAssetAddresses' },
    { label: 'Fetch Asset Metadata', to: 'fetchAssetMetadata' },
    { label: 'Fetch Block Info', to: 'fetchBlockInfo' },
    { label: 'Fetch Handle Address', to: 'fetchHandleAddress' },
    { label: 'Fetch Protocol Parameters', to: 'fetchProtocolParameters' },
    { label: 'Fetch Transaction Info', to: 'fetchTxInfo' },
    { label: 'Submit Tx', to: 'submitTx' },
    { label: 'On Transaction Confirmed', to: 'onTxConfirmed' },
  ];
  const [network, setNetwork] = useState<string>('preprod');

  return (
    <>
      <Metatags
        title="Blockfrost Provider"
        description="Accessing and processing information stored on the blockchain"
      />
      <CommonLayout sidebarItems={sidebarItems}>
        <Hero network={network} setNetwork={setNetwork} />
        <Main network={network} />
      </CommonLayout>
    </>
  );
}

function Hero({ network, setNetwork }) {
  let code1 = `const blockfrostProvider = new BlockfrostProvider('<BLOCKFROST_API_KEY>');\n`;
  let code2 = `const blockfrostProvider = new BlockfrostProvider('<BLOCKFROST_URL>');\n`;

  return (
    <header className="mb-4 lg:mb-6">
      <h2 className="mb-4 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
        Blockfrost
        <span className="ml-2">
          <BadgeFetcher />
          <BadgeSubmitter />
          <BadgeListener />
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
            stored on the blockchain. Get started:
          </p>
          <Codeblock data={code1} isJson={false} />
          <p>
            If you are using a privately hosted Blockfrost instance, you can set
            the URL in the parameter:
          </p>
          <Codeblock data={code2} isJson={false} />
          <p>Choose network for this demo:</p>
          <ButtonGroup
            items={[
              {
                key: 'mainnet',
                label: 'Mainnet',
                onClick: () => setNetwork('mainnet'),
              },
              {
                key: 'preprod',
                label: 'Preprod',
                onClick: () => setNetwork('preprod'),
              },
            ]}
            currentSelected={network}
          />
        </div>
        <div className="col-span-1"></div>
      </div>
    </header>
  );
}

function Main({ network }) {
  const [blockfrostProvider, setBlockfrostProvider] =
    useState<BlockfrostProvider | null>(null);

  useEffect(() => {
    async function load() {
      const _blockfrostProvider = new BlockfrostProvider(
        network == 'mainnet'
          ? process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_MAINNET!
          : network == 'preprod'
          ? process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_PREPROD!
          : ''
      );
      setBlockfrostProvider(_blockfrostProvider);
    }
    load();
  }, [network]);

  return (
    <>
      <Fetcher fetcher={blockfrostProvider} fetcherName="blockfrostProvider" />
      <Submitter
        submitter={blockfrostProvider}
        submitterName="blockfrostProvider"
      />
      <Listener
        listener={blockfrostProvider}
        listenerName="blockfrostProvider"
      />
    </>
  );
}
