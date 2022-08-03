import { Metatags } from '../../components';
import WalletApi from '../../components/wallet/walletApi';
import { Codeblock } from '../../components';

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
  return (
    <section className="px-4 lg:px-6">
      <WalletApi />
    </section>
  );
}

function Hero() {
  return (
    <section>
      <div className="py-8 px-4 lg:py-16 lg:px-6">
        <h1>Wallet APIs</h1>
        <p className="lead">
          Connect wallet, queries and performs wallet functions.
        </p>

        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
          <div>
            <p>
              Most wallet APIs are in accordance to{' '}
              <a
                href="https://github.com/cardano-foundation/CIPs/tree/master/CIP-0030"
                target="_blank"
                rel="noreferrer"
              >
                Cardano Improvement Proposals 30 - Cardano dApp-Wallet Web
                Bridge
              </a>
              , which defines the API for dApps to communicate with the
              user&apos;s wallet. Some utility functions provided for developers
              that are useful for building dApps.
            </p>
          </div>
          <div>
            <p className="font-medium">
              In this section, you can connect wallet and try APIs for dApps to
              communicate with your wallet. To start, import WalletService with:
            </p>
            <Codeblock
              data={`import { WalletService } from '@martifylabs/mesh';`}
              isJson={false}
            />
          </div>
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
