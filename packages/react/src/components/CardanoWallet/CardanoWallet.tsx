import tw, { styled } from 'twin.macro';
import { useState } from 'react';
import { useWallet, useWalletList } from '@mesh/hooks';
import { MenuItem } from './MenuItem';
import { WalletBalance } from './WalletBalance';
import { ConnectedMenuItem } from './ConnectedMenuItem';

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

export const CardanoWallet = () => {
  const [hideMenuList, setHideMenuList] = useState(true);

  const { connect, connected, name, connecting, disconnect } = useWallet();

  const walletList = useWalletList();

  return (
    <div
      onMouseEnter={() => setHideMenuList(false)}
      onMouseLeave={() => setHideMenuList(true)}
    >
      <StyledMenuButton
        type="button"
        onClick={() => setHideMenuList(!hideMenuList)}
      >
        <WalletBalance
          connected={connected}
          name={name}
          connecting={connecting}
        />
      </StyledMenuButton>
      <StyledMenuList hidden={hideMenuList}>
        {!connected && walletList.length > 0 ? (
          walletList.map((wallet, index) => (
            <MenuItem
              key={index}
              icon={wallet.icon}
              name={wallet.name}
              connect={() => {
                connect(wallet.name);
                setHideMenuList(!hideMenuList);
              }}
              active={name === wallet.name}
            />
          ))
        ) : walletList.length === 0 ? (
          <span>No Wallet Found.</span>
        ) : (
          <>
            <ConnectedMenuItem
              label="Disconnect"
              onclick={() => {
                disconnect();
              }}
            />
          </>
        )}
      </StyledMenuList>
    </div>
  );
};
