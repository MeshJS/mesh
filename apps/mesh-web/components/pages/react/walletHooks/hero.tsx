import { BoltIcon } from '@heroicons/react/24/solid';

export default function Hero() {
  return (
    <>
      <header className="mb-4 lg:mb-6">
        <h2 className="mb-4 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
          <div className="flex items-center">
            <div className="p-2 mr-4">
              <BoltIcon className="w-16 h-16" />
            </div>
            <span>Wallet Hooks</span>
          </div>
        </h2>
        <p className="mb-8 font-light text-gray-500 sm:text-xl dark:text-gray-400">
          React hooks for interacting with connected wallet.
        </p>
      </header>
      <div className="grid grid-cols-1 px-4 lg:grid-cols-3 lg:gap-4 pb-16">
        <div className="col-span-2">
          <p>
            In a React application, Hooks allows you to extract and reuse
            stateful logic and variables without changing your component
            hierarchy. This makes it easy to reuse the same Hook among many
            components.
          </p>
          <p className="font-medium">
            This page describes the list of built-in Hooks in Mesh to help you
            build React applications faster.
          </p>
        </div>
      </div>
    </>
  );
}
