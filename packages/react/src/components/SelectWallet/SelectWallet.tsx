import tw, { styled } from 'twin.macro';
import { useState } from 'react';
import { useWallet, useWalletList } from '@mesh/hooks';
import { ArrowDown } from './ArrowDown';

const StyledConnectButton = tw.button`
  inline-flex justify-center
  rounded-md border border-gray-100
  bg-white bg-opacity-0
  px-4 py-2
  text-sm font-medium
  shadow-sm hover:bg-opacity-20 bg-white/[.06]
  backdrop-blur w-60
`;

const StyledMenu = styled.div(({ hidden }: { hidden: boolean }) => [
  tw`z-10 absolute grid grid-cols-1 inline-flex justify-center rounded-md border border-gray-100 bg-white bg-opacity-0 px-4 py-2 text-sm font-medium shadow-sm hover:bg-opacity-20 bg-white/[.06] backdrop-blur w-60`,
  hidden && tw`hidden`,
]);

const StyledMenuItem = tw.button`
  flex justify-evenly items-start p-2 w-full
`;

export const SelectWallet = () => {
  const wallets = useWalletList();

  const {
    connect, connected, name,
  } = useWallet();

  const [hidden, setHidden] = useState(true);

  return (
    <div
      onMouseEnter={() => setHidden(false)}
      onMouseLeave={() => setHidden(true)}
    >
      <StyledConnectButton type="button" onClick={() => setHidden(!hidden)}>
        {connected ? `Connected: ${name}` : 'Connect Wallet'} <ArrowDown />
      </StyledConnectButton>
      <StyledMenu hidden={hidden}>
        {wallets.map((wallet, i) => {
          return (
            <StyledMenuItem
              key={i}
              onClick={() => {
                connect(wallet.name);
                setHidden(!hidden);
              }}
            >
              <div tw="flex-none">
                <img src={wallet.icon} tw="h-7 mr-4" />
              </div>
              <div
                tw={`flex-1 flex justify-start items-center h-full text-white font-normal	hover:font-bold`}
              >
                <span>{wallet.name}</span>
              </div>
            </StyledMenuItem>
          );
        })}
      </StyledMenu>
    </div>
  );
};
