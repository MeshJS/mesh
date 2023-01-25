import { useState, useEffect } from 'react';
import CommonLayout from '../../components/common/layout';
import Metatags from '../../components/site/metatags';
import Codeblock from '../../components/ui/codeblock';
import {
  BadgeFetcher,
  BadgeSubmitter,
  BadgeListener,
  BadgeEvaluator,
} from '../../components/pages/providers/badges';
import Fetcher from '../../components/pages/providers/fetcher';
import { TangoProvider } from '@meshsdk/core';
import Submitter from '../../components/pages/providers/submitter';
import ButtonGroup from '../../components/ui/buttongroup';
import Listener from '../../components/pages/providers/listener';
import Evaluator from '../../components/pages/providers/evaluator';

export default function ProvidersTangocrypto() {
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
    { label: 'Evaluate Tx', to: 'evaluateTx' },
  ];
  const [network, setNetwork] = useState<string>('preprod');

  return (
    <>
      <Metatags
        title="Tangocrypto Provider"
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
  let codeTango = `import { TangoProvider } from '@meshsdk/core';\n\n`;
  codeTango += `const tangocryptoProvider = new TangoProvider(\n`;
  codeTango += `  '<mainnet|testnet>',\n`;
  codeTango += `  '<TANGOCRYPTO_APP_ID>'\n`;
  codeTango += `  '<TANGOCRYPTO_API_KEY>'\n`;
  codeTango += `);`;

  return (
    <header className="mb-4 lg:mb-6">
      <h2 className="mb-4 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
        Tangocrypto
        <span className="ml-2">
          <BadgeFetcher />
          <BadgeSubmitter />
          <BadgeListener />
          <BadgeEvaluator />
        </span>
      </h2>
      <p className="mb-8 font-light text-gray-500 sm:text-xl dark:text-gray-400">
        Accessing and processing information stored on the blockchain
      </p>

      <div className="grid grid-cols-1 px-4 lg:grid-cols-2 lg:gap-16 pb-16">
        <div className="col-span-1 xl:col-auto">
          <p>
            <a href="https://tangocrypto.com/" target="_blank" rel="noreferrer">
              Tangocrypto
            </a>{' '}
            globally-distributed edge network offer realtime messaging
            performance, scalability, and reliability; which allows your app to
            access information stored on the blockchain.
          </p>
          <p>Get started:</p>
          <Codeblock data={codeTango} isJson={false} />
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
  const [tangocryptoProvider, setTangocryptoProvider] =
    useState<TangoProvider | null>(null);

  useEffect(() => {
    async function load() {
      if (network === 'mainnet') {
        const _provider = new TangoProvider(
          'mainnet',
          process.env.NEXT_PUBLIC_TANGOCRYPTO_API_ID_MAINNET!,
          process.env.NEXT_PUBLIC_TANGOCRYPTO_API_KEY_MAINNET!
        );
        setTangocryptoProvider(_provider);
      } else if (network === 'preprod') {
        const _provider = new TangoProvider(
          'testnet',
          process.env.NEXT_PUBLIC_TANGOCRYPTO_API_ID_TESTNET!,
          process.env.NEXT_PUBLIC_TANGOCRYPTO_API_KEY_TESTNET!
        );
        setTangocryptoProvider(_provider);
      }
    }
    load();
  }, [network]);

  return (
    <>
      <Fetcher
        fetcher={tangocryptoProvider}
        fetcherName="tangocryptoProvider"
      />
      <Submitter
        submitter={tangocryptoProvider}
        submitterName="tangocryptoProvider"
      />
      <Listener
        listener={tangocryptoProvider}
        listenerName="tangocryptoProvider"
      />
      <Evaluator
        evaluator={tangocryptoProvider}
        evaluatorName="tangocryptoProvider"
      />
    </>
  );
}
