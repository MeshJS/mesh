import { CubeTransparentIcon } from '@heroicons/react/24/solid';

export default function Hero() {
  return (
    <div className="relative mx-auto max-w-screen-xl text-white">
      <header className="mb-4 lg:mb-6">
        <h2 className="mb-4 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
          <div className="flex items-center">
            <div className="p-2 mr-4">
              <CubeTransparentIcon className="w-16 h-16" />
            </div>
            <span>Starter Templates</span>
          </div>
        </h2>
        <p className="mb-8 font-light text-gray-500 sm:text-xl dark:text-gray-400">
          Kick start your new Web3 project with one of our templates.
        </p>
      </header>
      {/* <div className="grid grid-cols-1 px-4 lg:grid-cols-3 lg:gap-4 pb-16">
        <div className="col-span-2">
          <p>The fastest way to get started on a web3 application.</p>
          <p className="font-medium">
            Explore the and use one of our templates, get started by installing
            using the CLI.
          </p>
        </div>
      </div> */}
    </div>
  );
}
