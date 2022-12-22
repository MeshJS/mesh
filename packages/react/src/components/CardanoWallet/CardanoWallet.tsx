import tw, { styled } from 'twin.macro';
import { useEffect, useState } from 'react';
import { useWallet, useWalletList } from '@mesh/hooks';
import { MenuItem } from '../MenuItem';
import { WalletBalance } from './WalletBalance';

const StyledMenuButton = tw.button`
  flex items-center justify-center
  font-normal text-lg
  border rounded-t-md
  px-4 py-2
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
  customCSS = {
    borderRadius: '0.375rem',
    fontSize: '1.125rem',
    borderColor: '#E5E7EB',
    color: 'inherit',
    width: '15rem',
  },
  label = 'Connect Wallet',
  onConnected = undefined,
}: {
  customCSS?: {};
  label?: string;
  onConnected?: any;
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
        onClick={() => setHideMenuList(!hideMenuList)}
        style={{
          borderColor: customCSS['borderColor'],
          borderRadius: customCSS['borderRadius'],
          fontSize: customCSS['fontSize'],
          color: customCSS['color'],
          width: customCSS['width'],
        }}
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
        style={{
          borderColor: customCSS['borderColor'],
          borderRadius: customCSS['borderRadius'],
          fontSize: customCSS['fontSize'],
          color: customCSS['color'],
          width: customCSS['width'],
        }}
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
