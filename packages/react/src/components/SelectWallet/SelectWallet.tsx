import tw, { styled } from 'twin.macro';
import { useState } from 'react';
import { useWallet, useWalletList } from '@mesh/hooks';
import { ArrowDown } from './ArrowDown';
import { MenuItem } from './MenuItem';

const StyledMenuButton = tw.button`
  flex items-center justify-center
  bg-white bg-opacity-0
  text-xl font-normal
  border rounded-md
  w-60 py-2 px-4
`;

const StyledMenuList = styled.div(({ hidden }: { hidden: boolean }) => [
  tw`
    z-10 absolute grid grid-cols-1 inline-flex justify-center
    rounded-md border border-gray-100 bg-white bg-opacity-0
    px-4 py-2 text-sm font-medium shadow-sm
    hover:bg-opacity-20 bg-white/[.06] backdrop-blur w-60
  `,
  hidden && tw`hidden`,
]);

const StyledMenuItem = tw.button`
  flex justify-evenly items-start p-2 w-full
`;

export const SelectWallet = () => {
  const [hideMenu, setHideMenu] = useState(true);

  const {
    connect, connected, connecting, error, name,
  } = useWallet();

  const walletList = useWalletList();

  return (
    <div
      onMouseEnter={() => setHideMenu(false)}
      onMouseLeave={() => setHideMenu(true)}
    >
      <StyledMenuButton type="button" onClick={() => setHideMenu(!hideMenu)}>
        {connected ? `Connected: ${name}` : 'Select Wallet'} <ArrowDown />
      </StyledMenuButton>
      <StyledMenuList hidden={false}>
        {walletList.map((wallet, i) => {
          return (
            <StyledMenuItem
              key={i}
              onClick={() => {
                connect(wallet.name);
                setHideMenu(!hideMenu);
              }}
            >
              <MenuItem icon={wallet.icon} name={wallet.name} />
            </StyledMenuItem>
          );
        })}
      </StyledMenuList>
    </div>
  );
};
