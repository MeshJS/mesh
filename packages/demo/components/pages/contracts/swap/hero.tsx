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
            <span>Swap</span>
          </div>
        </h2>
        <p className="mb-8 font-light text-gray-500 sm:text-xl dark:text-gray-400">
          Swap contract 
        </p>
      </header>
      <div className="grid grid-cols-1 px-4 lg:grid-cols-3 lg:gap-4 pb-16">
        <div className="col-span-2">
          <p>
            There are 2 actions (or endpoints) available to interact with this
            smart contract:
          </p>
          <ul>
            {/* <li>deposit asset</li>
            <li>withdraw asset</li> */}
          </ul>
          {/* <p>
            Do check out the{' '}
            <Link href="/guides/custom-marketplace">guide</Link> and the{' '}
            <Link href="/starter-templates">marketplace starter kit</Link> that
            might help you get started. This contract is written in{' '}
            <a
              href="https://pluts.harmoniclabs.tech/"
              target="_blank"
              rel="noreferrer"
            >
              plu-ts
            </a>
            , you can{' '}
            <a
              href="https://github.com/MeshJS/mesh/blob/main/packages/contracts/src/marketplace/contract.ts"
              target="_blank"
              rel="noreferrer"
            >
              view the contract on GitHub
            </a>
            .
          </p> */}
        </div>
      </div>
    </>
  );
}
