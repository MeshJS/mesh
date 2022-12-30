import { useState, useEffect } from 'react';
import CommonLayout from '../../components/common/layout';
import Metatags from '../../components/site/metatags';
import Codeblock from '../../components/ui/codeblock';
import {
  BadgeEvaluator,
  BadgeSubmitter,
} from '../../components/pages/providers/badges';
import { OgmiosProvider, Transaction } from '@meshsdk/core';
import Submitter from '../../components/pages/providers/submitter';
// import ButtonGroup from '../../components/ui/buttongroup';
import { CardanoWallet, useWallet } from '@meshsdk/react';
import Button from '../../components/ui/button';

export default function ProvidersOgmios() {
  const sidebarItems = [
    // { label: 'Fetch Account Info', to: 'fetchAccountInfo' },
    // { label: 'Fetch Asset Addresses', to: 'fetchAssetAddresses' },
    // { label: 'Fetch Asset Metadata', to: 'fetchAssetMetadata' },
    // { label: 'Fetch Address Utxos', to: 'fetchAddressUtxos' },
    // { label: 'Fetch Handle Address', to: 'fetchHandleAddress' },
    // { label: 'Fetch Protocol Parameters', to: 'fetchProtocolParameters' },
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
  const { wallet, connected } = useWallet();

  let code1 = `const ogmiosProvider = new OgmiosProvider();\n`;

  const ogmiosProvider = new OgmiosProvider(
    'wss://ogmios-api.testnet.dandelion.link'
  );

  async function test() {
    const tx = new Transaction({ initiator: wallet }).sendLovelace(
      'addr_test1qzmwuzc0qjenaljs2ytquyx8y8x02en3qxswlfcldwetaeuvldqg2n2p8y4kyjm8sqfyg0tpq9042atz0fr8c3grjmysm5e6yx',
      '1000000'
    );
    const unsignedTx = await tx.build();
    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await ogmiosProvider.submitTx(signedTx);
    console.log({ txHash });

    // const res = await ogmiosProvider.evaluateTx(signedTx);
    // console.log({ res });
  }

  useEffect(() => {
    if (connected) {
      ogmiosProvider.onNextTx((tx) => {
        console.log(111, 'ogmiosProvider.onNextTx', tx);
      });
    }
  }, [connected]);

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

      <CardanoWallet />

      <Button onClick={() => test()}>test</Button>

      <div className="grid grid-cols-1 px-4 lg:grid-cols-2 lg:gap-16 pb-16">
        <div className="col-span-1 xl:col-auto">
          {/* <p>
            <a href="https://blockfrost.io/" target="_blank" rel="noreferrer">
              Blockfrost
            </a>{' '}
            provides restful APIs which allows your app to access information
            stored on the blockchain.
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
          /> */}
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
      const _provider = new OgmiosProvider();
      setProvider(_provider);
    }
    load();
  }, [network]);

  return (
    <>
      {/* <Fetcher fetcher={provider} fetcherName="provider" /> */}
      <Submitter submitter={provider} submitterName="ogmiosProvider" />
    </>
  );
}
