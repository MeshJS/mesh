import { useState } from 'react';
import { Metatags } from '../../components';
import ConnectWallet from '../../components/wallet/connectWallet';
import WalletApi from '../../components/wallet/walletApi';
import { ChevronRightIcon, LinkIcon } from '@heroicons/react/solid';

const Wallet = () => {
  return (
    <>
      <Metatags title="Wallet APIs" />
      <Hero />
      <Showcase />
    </>
  );
};

function Showcase() {
  const [walletConnected, setWalletConnected] = useState<boolean>(false);

  return (
    <section className="px-4 lg:px-6">
      <h2>Connect available wallets</h2>
      <ConnectWallet setWalletConnected={setWalletConnected} />
      {walletConnected && (
        <>
          <WalletApi />
        </>
      )}
    </section>
  );
}

function Hero() {
  return (
    <section>
      <div className="py-8 px-4 lg:py-16 lg:px-6">
        <h1>Wallet APIs</h1>

        <div className="mb-4">
          <p>
            These wallet APIs are in accordance to{' '}
            <a href="https://github.com/cardano-foundation/CIPs/tree/master/CIP-0030">
              Cardano Improvement Proposals 30 - Cardano dApp-Wallet Web Bridge
            </a>
            , which defines the API for dApps to communicate with the
            user&apos;s wallet.
          </p>
        </div>
        <div className="mb-4">
          <p className="font-medium">
            In this section, you can connect wallet and try APIs for dApps to
            communicate with your wallet.
          </p>
        </div>

        {/* <a
          href="#"
          className="inline-flex items-center font-medium text-primary-600 hover:text-primary-800 dark:text-primary-500 dark:hover:text-primary-700"
        >
          Learn more
          <ChevronRightIcon className="ml-1 w-6 h-6" />
        </a> */}
      </div>
    </section>
  );
}

export default Wallet;
