import { useState } from 'react';
import { Metatags } from '../../components';
import ConnectWallet from '../../components/wallet/connectWallet';
import WalletApi from '../../components/wallet/walletApi';

const Wallet = () => {
  return (
    <div className="px-4">
      <Metatags
        title="Wallet APIs"
        description="Cardano wallet APIs in accordance to the CIP 30 standards."
      />
      <Hero />
      <Showcase />
    </div>
  );
};

function Showcase() {
  const [walletConnected, setWalletConnected] = useState<boolean>(false);

  return (
    <section className="lg:px-6">
      <h2>Connect available wallets</h2>
      <ConnectWallet setWalletConnected={setWalletConnected} />
      <WalletApi walletConnected={walletConnected} />
    </section>
  );
}

function Hero() {
  return (
    <section>
      <div className="py-8 lg:py-16 lg:px-6">
        <h1>Wallet APIs</h1>
        <p className="lead">
          Cardano wallet APIs in accordance to the CIP 30 standards.
        </p>

        <div className="mb-4">
          <p>
            These wallet APIs are in accordance to{' '}
            <a href="https://github.com/cardano-foundation/CIPs/tree/master/CIP-0030">
              Cardano Improvement Proposals 30 - Cardano dApp-Wallet Web Bridge
            </a>
            , which defines the API for dApps to communicate with the
            user&apos;s wallet.
          </p>
          <p className="font-medium">
            In this section, you can connect wallet and try APIs for dApps to
            communicate with your wallet.
          </p>
        </div>
      </div>
    </section>
  );
}

export default Wallet;
