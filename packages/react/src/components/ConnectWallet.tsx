import { useState } from 'react';
import { useWallet, useWalletList } from '@mesh/hooks';

export const ConnectWallet = ({
  classNameButton,
  classNameLabel,
}: {
  classNameButton?: string;
  classNameLabel?: string;
}) => {
  const wallets = useWalletList();
  const [showMenu, setShowMenu] = useState(false);
  const { connected, connect, name } = useWallet();

  const toggleMenu = () => {
    setShowMenu(!showMenu);
  };

  const buttonClasses =
    classNameButton ??
    `inline-flex justify-center rounded-md border border-gray-100 bg-white bg-opacity-0 px-4 py-2 text-sm font-medium shadow-sm hover:bg-opacity-20 bg-white/[.06] backdrop-blur w-60`;

  const labelClasses =
    classNameLabel ?? `text-white font-normal	hover:font-bold`;

  return (
    <>
      <div
        onMouseEnter={() => setShowMenu(true)}
        onMouseLeave={() => setShowMenu(false)}
      >
        <button
          className={buttonClasses}
          type="button"
          onClick={() => toggleMenu()}
        >
          {connected ? `Connected: ${name}` : 'Connect Wallet'}

          <svg
            className="ml-2 w-4 h-4"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M19 9l-7 7-7-7"
            ></path>
          </svg>
        </button>
        <div
          className={`${
            !showMenu && 'hidden'
          } z-10 absolute grid grid-cols-1 ${buttonClasses}`}
        >
          {wallets?.map((wallet, i) => {
            return (
              <button
                key={i}
                onClick={() => {
                  connect(wallet.name);
                  setShowMenu(false);
                }}
                className={`flex justify-evenly items-start p-2 w-full`}
              >
                <div className="flex-none">
                  <img src={wallet.icon} className="h-7 mr-4" />
                </div>
                <div
                  className={`flex-1 flex justify-start items-center h-full ${labelClasses}`}
                >
                  <span>{wallet.name}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
};
