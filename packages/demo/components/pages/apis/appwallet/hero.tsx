import { CodeBracketSquareIcon } from '@heroicons/react/24/solid';

export default function Hero() {
  return (
    <>
      <header className="mb-4 lg:mb-6">
        <h2 className="mb-4 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
          <div className="flex items-center">
            <div className="p-2 mr-4">
              <CodeBracketSquareIcon className="w-16 h-16" />
            </div>
            <span>App Wallet</span>
          </div>
        </h2>
        <p className="mb-8 font-light text-gray-500 sm:text-xl dark:text-gray-400">
          Wallet for building transactions in your applications.
        </p>
      </header>
      <div className="grid grid-cols-1 px-4 lg:grid-cols-3 lg:gap-4 pb-16">
        <div className="col-span-2">
          <p>
            <code>AppWallet</code> is useful for building other user wallets and
            fully customed applications's backend.
          </p>
          <p className="font-medium"></p>
        </div>
      </div>
    </>
  );
}
