import { useState, useEffect } from 'react';
import CommonLayout from '../../components/common/layout';
import Metatags from '../../components/site/metatags';
import Codeblock from '../../components/ui/codeblock';
import {
  BadgeEvaluator,
  BadgeFetcher,
  BadgeSubmitter,
  BadgeListener,
} from '../../components/pages/providers/badges';
import Fetcher from '../../components/pages/providers/fetcher';
import { MaestroSupportedNetworks, MaestroProvider } from '@meshsdk/core';
import Submitter from '../../components/pages/providers/submitter';
import Evaluator from '../../components/pages/providers/evaluator';
import ButtonGroup from '../../components/ui/buttongroup';
import Listener from '../../components/pages/providers/listener';

export default function ProvidersMaestro() {
  const sidebarItems = [
    { label: 'Fetch Account Info', to: 'fetchAccountInfo' },
    { label: 'Fetch Address Utxos', to: 'fetchAddressUtxos' },
    { label: 'Fetch Asset Addresses', to: 'fetchAssetAddresses' },
    { label: 'Fetch Asset Metadata', to: 'fetchAssetMetadata' },
    { label: 'Fetch Block Info', to: 'fetchBlockInfo' },
    { label: 'Fetch Collection Assets', to: 'fetchCollectionAssets' },
    { label: 'Fetch Handle Address', to: 'fetchHandleAddress' },
    { label: 'Fetch Protocol Parameters', to: 'fetchProtocolParameters' },
    { label: 'Fetch Transaction Info', to: 'fetchTxInfo' },
    { label: 'Evaluate Tx', to: 'evaluateTx' },
    { label: 'Submit Tx', to: 'submitTx' },
    { label: 'On Transaction Confirmed', to: 'onTxConfirmed' },
  ];

  const [network, setNetwork] = useState<string>('preprod');

  return (
    <>
      <Metatags
        title="Maestro Provider"
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
  let code1 = `const MaestroProvider = new MaestroProvider({
       network: '${network.charAt(0).toUpperCase() + network.slice(1)}',
       apiKey: '<Your-API-Key>', // Get yours by visiting https://docs.gomaestro.org/docs/Getting-started/Sign-up-login.
       turboSubmit: false // Read about paid turbo transaction submission feature at https://docs.gomaestro.org/docs/Dapp%20Platform/Turbo%20Transaction.
     });\n`;

  return (
    <header className="mb-4 lg:mb-6">
      <h2 className="mb-4 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
        Maestro
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
            <a
              href="https://www.gomaestro.org/"
              target="_blank"
              rel="noreferrer"
            >
              Maestro
            </a>{' '}
            is the complete Web3 stack for Cardano which provides among others:-
          </p>
          <ul>
            <li>⛓️ Enterprise-grade onchain data access.</li>
            <li>
              ⚡️ Transaction monitoring system with submission retires,
              rollback notifications and accelerated tranaction finality.
            </li>
            <li>
              💰 High-fidelity smart contract data feeds from top Cardano DeFi
              protocols.
            </li>
            <li>
              📝 Fully managed smart contract APIs and ready-to-go UI plugins.
            </li>
          </ul>
          <p>Get started:</p>
          <Codeblock data={code1} isJson={false} />
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
              {
                key: 'preview',
                label: 'Preview',
                onClick: () => setNetwork('preview'),
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
  const [provider, setProvider] = useState<MaestroProvider | null>(null);

  useEffect(() => {
    async function load() {
      let key = '';
      let maestroNetwork: MaestroSupportedNetworks = 'Mainnet';
      switch (network) {
        case 'mainnet':
          key = process.env.NEXT_PUBLIC_MAESTRO_API_KEY_MAINNET!;
          maestroNetwork = 'Mainnet';
          break;
        case 'preprod':
          key = process.env.NEXT_PUBLIC_MAESTRO_API_KEY_PREPROD!;
          maestroNetwork = 'Preprod';
          break;
        case 'preview':
          key = process.env.NEXT_PUBLIC_MAESTRO_API_KEY_PREVIEW!;
          maestroNetwork = 'Preview';
          break;
        default:
          break;
      }
      const _provider = new MaestroProvider({
        network: maestroNetwork,
        apiKey: key,
      });
      setProvider(_provider);
    }
    load();
  }, [network]);
  const providerName = "maestroProvider"
  return (
    <>
      <Fetcher fetcher={provider} fetcherName={providerName} />
      <Evaluator evaluator={provider} evaluatorName={providerName} />
      <Submitter submitter={provider} submitterName={providerName} />
      <Listener listener={provider} listenerName={providerName} />
    </>
  );
}
