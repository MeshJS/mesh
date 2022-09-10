import {
  ChevronDownIcon,
  WalletIcon,
  Cog8ToothIcon,
  ChevronUpIcon,
  PlusCircleIcon,
} from '@heroicons/react/24/solid';
import { useState } from 'react';
import Link from 'next/link';
import { Tooltip } from 'flowbite-react';

export default function Sidebar() {
  return (
    <aside className="flex fixed top-0 left-0 z-20 flex-col flex-shrink-0 pt-16 w-64 h-full duration-75 lg:flex transition-width">
      <div className="flex relative flex-col flex-1 pt-0 min-h-0 bg-white border-r border-gray-200 dark:bg-gray-800 dark:border-gray-700">
        <div className="flex overflow-y-auto flex-col flex-1 pt-5 pb-4">
          <div className="flex-1 px-3 space-y-1 bg-white divide-y divide-gray-200 dark:bg-gray-800 dark:divide-gray-700">
            <ul className="pb-2 space-y-2">
              <BrowserWallet />
            </ul>
            <div className="pt-2 space-y-2">
              <a
                href="/"
                target="_blank"
                rel="noreferrer"
                className="flex items-center p-2 text-base font-normal text-gray-900 rounded-lg transition duration-75 hover:bg-gray-100 group dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <WalletIcon className="flex-shrink-0 w-6 h-6 text-gray-500 transition duration-75 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white" />
                <span className="ml-3">Help</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function BrowserWallet() {
  const [toggleShowWallets, settoggleShowWallets] = useState<boolean>(true);
  const sections = [
    {
      label: 'Installed wallets',
      ref: 'browserwalletInstalledWallets',
    },
    {
      label: 'Connect wallet',
      ref: 'browserwalletConnectWallet',
    },
  ];

  return (
    <li>
      <button
        type="button"
        className="flex items-center p-2 w-full text-base font-normal text-gray-900 rounded-lg transition duration-75 group hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
        onClick={() => settoggleShowWallets(!toggleShowWallets)}
      >
        <WalletIcon className="flex-shrink-0 w-6 h-6 text-gray-500 transition duration-75 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white" />
        <span className="flex-1 ml-3 text-left whitespace-nowrap">
          Browser wallet
        </span>
        {toggleShowWallets ? (
          <ChevronUpIcon className="flex-shrink-0 w-6 h-6 text-gray-500 transition duration-75 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white" />
        ) : (
          <ChevronDownIcon className="flex-shrink-0 w-6 h-6 text-gray-500 transition duration-75 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white" />
        )}
      </button>
      <ul className={`py-2 space-y-2 ${!toggleShowWallets && 'hidden'}`}>
        {sections.map((section, i) => {
          return (
            <li key={i}>
              <Link href={`/apis/browserwallet#${section.ref}`}>
                <div className="text-base text-gray-900 font-normal rounded-lg hover:bg-gray-100 flex items-center p-2 group dark:text-gray-200 dark:hover:bg-gray-700 cursor-pointer">
                  <span className="flex-1 ml-3 whitespace-nowrap">
                    {section.label}
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </li>
  );
}
