import tw, { styled } from 'twin.macro';
import { useState } from 'react';
import { useWallet, useWalletList } from '@mesh/hooks';
import { ArrowDown } from './ArrowDown';
import { MenuItem } from './MenuItem';

const StyledMenuButton = tw.button`
  flex items-center justify-center
  font-normal text-lg
  border rounded-t-lg
  w-60 px-4 py-2
  shadow-sm
`;

const StyledMenuList = styled.div(({ hidden }: { hidden: boolean }) => [
  tw`
    shadow-sm backdrop-blur
    border rounded-b-lg
    text-center
    absolute
    w-60 
  `,
  hidden && tw`hidden`,
]);

export const SelectWallet = () => {
  const [hideMenuList, setHideMenuList] =
    useState(true);

  const {
    connect, connected, name,
  } = useWallet();

  const walletList = useWalletList();

  return (
    <div
      onMouseEnter={() => setHideMenuList(false)}
      onMouseLeave={() => setHideMenuList(true)}
    >
      <StyledMenuButton type="button" onClick={() => setHideMenuList(!hideMenuList)}>
        {connected
          ? `Connected: ${name}`
          : <>Select Wallet <ArrowDown /></>
        }
      </StyledMenuButton>
      <StyledMenuList hidden={hideMenuList}>
      {walletList.length > 0
        ? walletList.map((wallet, index) => (
            <MenuItem
              key={index}
              icon={wallet.icon}
              name={wallet.name}
              connect={() => {
                connect(wallet.name);
                setHideMenuList(!hideMenuList);
              }}
            />
          ))
        : <span>No Wallet Found.</span>}
      </StyledMenuList>
    </div>
  );
};
