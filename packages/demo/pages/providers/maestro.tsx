import { useState, useEffect } from 'react';
import CommonLayout from '../../components/common/layout';
import Metatags from '../../components/site/metatags';
import Codeblock from '../../components/ui/codeblock';
import {
  BadgeFetcher,
  BadgeSubmitter,
  BadgeListener,
} from '../../components/pages/providers/badges';
import Fetcher from '../../components/pages/providers/fetcher';
import { MaestroSupportedNetworks } from '@meshsdk/core';
import Submitter from '../../components/pages/providers/submitter';
import ButtonGroup from '../../components/ui/buttongroup';
import Listener from '../../components/pages/providers/listener';
import { MaestroProvider } from '@meshsdk/core';

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
  let code1 = `const MaestroProvider = new MaestroProvider('<api|preview|preprod|guild>');\n`;

  return (
    <header className="mb-4 lg:mb-6">
      <h2 className="mb-4 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
        Maestro
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
          {/* <p>
            <a href="https://www.koios.rest/" target="_blank" rel="noreferrer">
              Koios
            </a>{' '}
            provides a query layer which allows your app to access information
            stored on the blockchain.
          </p>
          <iframe
            className="mx-auto w-full max-w-xl h-64 rounded-lg sm:h-96"
            src="https://www.youtube.com/embed/lOoPNYiVxkg"
            title="YouTube video player"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          ></iframe>
          <p>Get started:</p>
          <Codeblock data={code1} isJson={false} />
          <p>
            If you are using a privately hosted instance, you can set the URL in
            the parameter:
          </p>
          <Codeblock data={code2} isJson={false} /> */}
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
  const [provider, setProvider] =
    useState<MaestroProvider | null>(null);

  useEffect(() => {
    async function load() {

      var key;
      let maestroNetwork: MaestroSupportedNetworks = "Mainnet";
      console.log("choosing a key");
      switch (network) {
        case 'mainnet':
          key = 'ppKT8M4Y1GutZ7bDYvHYlPbV3yEsELlR';
          maestroNetwork = "Mainnet"
          break;
        case 'preprod':
          key = '7t7yuQwtaSuxXFNEyxFsofvOYUtLKIGW';
          maestroNetwork = "Preprod"
          break;
        case 'preview':
          key = 'MmXsDx5TRbMfv3MXyy8rXXMS3994pjpI';
          maestroNetwork = "Preview"
          break;
        default:
          console.log("unknown network");
          break;
      }
      const _provider = new MaestroProvider({ network: maestroNetwork, apiKey: key });
      setProvider(_provider);
    }
    load();
  }, [network]);

  return (
    <>
      <Fetcher fetcher={provider} fetcherName="provider" />
      <Submitter submitter={provider} submitterName="provider" />
      <Listener listener={provider} listenerName="provider" />
    </>
  );
}
