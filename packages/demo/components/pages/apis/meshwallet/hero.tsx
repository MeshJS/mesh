import { WalletIcon } from '@heroicons/react/24/solid';

export default function Hero() {
  return (
    <>
      <header className="mb-4 lg:mb-6">
        <h2 className="mb-4 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
          <div className="flex items-center">
            <div className="p-2 mr-4">
              <WalletIcon className="w-16 h-16" />
            </div>
            <span>Mesh Wallet</span>
          </div>
        </h2>
        <p className="mb-8 font-light text-gray-500 sm:text-xl dark:text-gray-400">
          Mesh Wallet provides a set of APIs to interact with the blockchain.
          This wallet is compatible with Mesh transaction builders.
        </p>
      </header>
      <div className="grid grid-cols-1 px-4 lg:grid-cols-3 lg:gap-4 pb-16">
        <div className="col-span-2">
        <p>
            Whether you are building a minting script, or an application that
            requires multi-signature, <code>MeshWallet</code> is all you need to
            get started.
          </p>
        </div>
      </div>
    </>
  );
}
