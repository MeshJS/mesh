import { useState, useEffect } from 'react';
import CommonLayout from '../../components/common/layout';
import Metatags from '../../components/site/metatags';
import Codeblock from '../../components/ui/codeblock';
import {
  BadgeEvaluator,
  BadgeSubmitter,
} from '../../components/pages/providers/badges';
import { OgmiosProvider } from '@meshsdk/core';
import Submitter from '../../components/pages/providers/submitter';
import Evaluator from '../../components/pages/providers/evaluator';
import ButtonGroup from '../../components/ui/buttongroup';

export default function ProvidersOgmios() {
  const sidebarItems = [
    { label: 'Evaluate Tx', to: 'evaluateTx' },
    { label: 'Submit Tx', to: 'submitTx' },
  ];
  const [network, setNetwork] = useState<string>('preprod');

  return (
    <>
      <Metatags
        title="Ogmios Provider"
        description="WebSockets API that enables local clients to speak Ouroboros' mini-protocols"
      />
      <CommonLayout sidebarItems={sidebarItems}>
        <Hero network={network} setNetwork={setNetwork} />
        <Main network={network} />
      </CommonLayout>
    </>
  );
}

function Hero({ network, setNetwork }) {
  let code1 = `const ogmiosProvider = new OgmiosProvider();\n`;

  return (
    <header className="mb-4 lg:mb-6">
      <h2 className="mb-4 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
        Ogmios
        <span className="ml-2">
          <BadgeEvaluator />
          <BadgeSubmitter />
        </span>
      </h2>
      <p className="mb-8 font-light text-gray-500 sm:text-xl dark:text-gray-400">
        Ogmios is a lightweight bridge interface for cardano-node. It offers a
        WebSockets API that enables local clients to speak Ouroboros'
        mini-protocols via JSON/RPC.
      </p>

      <div className="grid grid-cols-1 px-4 lg:grid-cols-2 lg:gap-16 pb-16">
        <div className="col-span-1 xl:col-auto">
          <p>
            Ogmios is a lightweight bridge interface for cardano-node. It offers
            a WebSockets API that enables local clients to speak Ouroboros'
            mini-protocols via JSON/RPC. Ogmios is a fast and lightweight
            solution that can be deployed alongside relays to create entry
            points on the Cardano network for various types of applications.
            (reference:{' '}
            <a href="https://ogmios.dev/" target="_blank" rel="noreferrer">
              ogmios.dev
            </a>
            )
          </p>
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
  const [provider, setProvider] = useState<OgmiosProvider | null>(null);

  useEffect(() => {
    async function load() {
      const _provider = new OgmiosProvider('preprod');
      setProvider(_provider);
    }
    load();
  }, [network]);

  return (
    <>
      <Evaluator evaluator={provider} evaluatorName="ogmiosProvider" />
      <Submitter submitter={provider} submitterName="ogmiosProvider" />
    </>
  );
}
