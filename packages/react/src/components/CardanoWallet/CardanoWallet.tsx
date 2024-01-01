import tw, { styled } from 'twin.macro';
import { useEffect, useState } from 'react';
import { useWallet, useWalletList } from '@mesh/hooks';
import { MenuItem } from '../MenuItem';
import { WalletBalance } from './WalletBalance';
// import { AppWallet } from '@meshsdk/core';

const StyledMenuButton = tw.button`
  flex items-center justify-center
  font-normal text-lg
  border rounded-t-md
  w-60 px-4 py-2
  shadow-sm
`;

const StyledMenuList = styled.div(({ hidden }: { hidden: boolean }) => [
  tw`
    shadow-sm backdrop-blur
    border rounded-b-md
    absolute w-60
    text-center
  `,
  hidden && tw`hidden`,
]);

export const CardanoWallet = ({
  label = 'Connect Wallet',
  onConnected = undefined,
  isDark = false,
}: {
  label?: string;
  onConnected?: Function;
  isDark?: boolean;
}) => {
  const [isDarkMode, setIsDarkMode] = useState(false);

  const wallets = useWalletList();

  const [hideMenuList, setHideMenuList] = useState(true);

  const { connect, connecting, connected, disconnect, name } = useWallet();

  useEffect(() => {
    if (connected && onConnected) {
      onConnected();
    }
  }, [connected]);

  useEffect(() => {
    setIsDarkMode(isDark);
  }, [isDark]);

  // async function connectLocalWallet() {
  //   // check if local has wallet

  //   // if yes, connect to it

  //   // if no, create a new wallet
  //   const mnemonic = AppWallet.brew();
  //   console.log('mnemonic', mnemonic);

  //   // have to create wallet without provider,
  //   // so we can get wallet address,
  //   // get keys with wallet info,
  //   // add koios provider later

  //   // const wallet = new AppWallet({
  //   //   networkId: 0,
  //   //   fetcher: blockchainProvider, // ?? keys? api to get keys, and use koios
  //   //   submitter: blockchainProvider,
  //   //   key: {
  //   //     type: 'mnemonic',
  //   //     words: mnemonic,
  //   //   },
  //   // });

  //   // save `wallet` to `WalletContext`, so we can use it at `useWallet()`
  // }

  return (
    <div
      style={{ width: 'fit-content' }}
      onMouseEnter={() => setHideMenuList(false)}
      onMouseLeave={() => setHideMenuList(true)}
    >
      <StyledMenuButton
        type="button"
        className="mr-wallet-button"
        style={{
          backgroundColor: isDarkMode ? '#1f1f1f' : '#fff',
          color: isDarkMode ? '#fff' : '#000',
        }}
        onClick={() => setHideMenuList(!hideMenuList)}
      >
        <WalletBalance
          name={name}
          connected={connected}
          connecting={connecting}
          label={label}
        />
      </StyledMenuButton>
      <StyledMenuList
        hidden={hideMenuList}
        className="mr-menu-list"
        style={{
          backgroundColor: isDarkMode ? '#1f1f1f' : '#fff',
          color: isDarkMode ? '#fff' : '#000',
        }}
      >
        {!connected && wallets.length > 0 ? (
          <>
            {wallets.map((wallet, index) => (
              <MenuItem
                key={index}
                icon={wallet.icon}
                label={wallet.name}
                action={() => {
                  connect(wallet.name);
                  setHideMenuList(!hideMenuList);
                }}
                active={name === wallet.name}
              />
            ))}
            {/* <MenuItem
              icon={
                isDarkMode
                  ? `https://meshjs.dev/logo-mesh/white/logo-mesh-white-128x128.png`
                  : `https://meshjs.dev/logo-mesh/black/logo-mesh-black-128x128.png`
              }
              label={'Local'}
              action={() => {
                connectLocalWallet();
                setHideMenuList(!hideMenuList);
              }}
              active={false}
            /> */}
          </>
        ) : wallets.length === 0 ? (
          <span>No Wallet Found</span>
        ) : (
          <>
            <MenuItem
              active={false}
              label="disconnect"
              action={disconnect}
              icon={undefined}
            />
          </>
        )}
      </StyledMenuList>
    </div>
  );
};
