import tw, { styled } from 'twin.macro';
import { useEffect, useState } from 'react';
import { useWallet, useWalletList } from '@mesh/hooks';
import { MenuItem } from '../MenuItem';
import { WalletBalance } from './WalletBalance';

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
  onConnected = undefined
}: {
  label?: string,
  onConnected?: Function
}) => {
  const wallets = useWalletList();

  const [hideMenuList, setHideMenuList] = useState(true);

  const { connect, connecting, connected, disconnect, name } = useWallet();

  useEffect(() => {
    if (connected && onConnected) {
      onConnected();
    }
  }, [connected]);

  return (
    <div
      style={{ width: 'fit-content' }}
      onMouseEnter={() => setHideMenuList(false)}
      onMouseLeave={() => setHideMenuList(true)}
    >
      <StyledMenuButton
        type="button"
        className="mr-wallet-button"
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
      >
        {!connected && wallets.length > 0 ? (
          wallets.map((wallet, index) => (
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
          ))
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
