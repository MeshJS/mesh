import { ArrowsRightLeftIcon } from '@heroicons/react/24/solid';

export default function Hero() {
  return (
    <>
      <header className="mb-4 lg:mb-6">
        <h2 className="mb-4 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
          <div className="flex items-center">
            <div className="p-2 mr-4">
              <ArrowsRightLeftIcon className="w-16 h-16" />
            </div>
            <span>Escrow</span>
          </div>
        </h2>
        <p className="mb-8 font-light text-gray-500 sm:text-xl dark:text-gray-400">
          Escrow contract facilitates the secure exchange of assets between two
          parties by acting as a trusted intermediary that holds the assets
          until the conditions of the agreement are met.
        </p>
      </header>
      <div className="grid grid-cols-1 px-4 lg:grid-cols-3 lg:gap-4 pb-16">
        <div className="col-span-2">
          <p>
            There are 4 actions available to interact with this smart contract:
          </p>
          <ul>
            <li>initiate escrow</li>
            <li>deposit</li>
            <li>complete</li>
            <li>cancel</li>
          </ul>
        </div>
      </div>
    </>
  );
}
