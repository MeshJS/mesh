import { useState } from "react";
import { Metatags } from "../../components";
import ConnectWallet from "./connectWallet";
import WalletApi from "./walletApi";
import { ChevronRightIcon, LinkIcon } from "@heroicons/react/solid";
const Wallet = () => {
  const [walletConnected, setWalletConnected] = useState<null | string>(null);
  return (
    <>
      <Metatags title="Wallet APIs" />
      <Hero />
      <Showcase />

      {/* <div className="mt-32 prose prose-slate mx-auto lg:prose-lg">
        <Metatags title="Wallet APIs" />
        <Hero />
        <h1>Wallet APIs</h1>
        <p className="lead">
          In this section, you can connect wallet and try APIs for dApps to
          communicate with your wallet.
        </p>
        <ConnectWallet
          walletConnected={walletConnected}
          setWalletConnected={setWalletConnected}
        />
        {walletConnected && (
          <>
            <WalletApi />
          </>
        )}
      </div> */}
    </>
  );
};

function Showcase() {
  const [walletConnected, setWalletConnected] = useState<null | string>(null);
  return (
    <section className="bg-white dark:bg-gray-900">
      <div className="py-8 px-4 mx-auto max-w-screen-xl lg:py-16 lg:px-6">
        <ConnectWallet
          walletConnected={walletConnected}
          setWalletConnected={setWalletConnected}
        />
        {walletConnected && (
          <>
            <WalletApi />
          </>
        )}
      </div>
    </section>
  );
}

function Hero() {
  return (
    <section className="bg-white dark:bg-gray-900">
      <div className="py-8 px-4 mx-auto max-w-screen-xl lg:py-16 lg:px-6">
        <div className="max-w-screen-lg text-gray-500 sm:text-lg dark:text-gray-400">
          <h1 className="mb-4 text-4xl tracking-tight font-bold text-gray-900 dark:text-white">
            Wallet APIs
          </h1>
          <p className="mb-4 font-light">
            These wallet APIs are in accordance to{" "}
            <a href="https://github.com/cardano-foundation/CIPs/tree/master/CIP-0030">
              Cardano Improvement Proposals 30 - Cardano dApp-Wallet Web Bridge
            </a>
            , which defines the API for dApps to communicate with the
            user&apos;s wallet.
          </p>
          <p className="mb-4 font-medium">
            In this section, you can connect wallet and try APIs for dApps to
            communicate with your wallet.
          </p>
          {/* <a
            href="#"
            className="inline-flex items-center font-medium text-primary-600 hover:text-primary-800 dark:text-primary-500 dark:hover:text-primary-700"
          >
            Learn more
            <ChevronRightIcon className="ml-1 w-6 h-6" />
          </a> */}
        </div>
      </div>
    </section>
  );
}

export default Wallet;
