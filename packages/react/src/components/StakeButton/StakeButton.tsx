import tw, { styled } from 'twin.macro';
import { useEffect, useState } from 'react';
import {
  useRewardAddress, useWallet, useWalletList, useWalletTx,
} from '@mesh/hooks';
import { ChevronDown } from '../ChevronDown';
import { MenuItem } from '../MenuItem';
import type { AccountStatus } from '@martifylabs/mesh';

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

export const StakeButton = ({ checkAccountStatus, poolId }) => {
  const wallets = useWalletList();

  const [hideMenuList, setHideMenuList] = useState(true);

  const { connect, connecting, connected, name, wallet } = useWallet();

  return (
    <div
      onMouseEnter={() => setHideMenuList(false)}
      onMouseLeave={() => setHideMenuList(true)}
    >
      <StyledMenuButton
        type="button"
        onClick={() => setHideMenuList(!hideMenuList)}
      >
        {connected ? (
          <Delegate wallet={wallet} poolId={poolId} check={checkAccountStatus} />
        ) : connecting ? (
          <>Connecting...</>
        ) : (
          <>
            Connect Wallet <ChevronDown />
          </>
        )}
      </StyledMenuButton>
      <StyledMenuList hidden={hideMenuList}>
        {wallets.length > 0 ? (
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
        ) : (
          <span>No Wallet Found</span>
        )}
      </StyledMenuList>
    </div>
  );
};

const Delegate = ({ wallet, poolId, check }) => {
  const tx = useWalletTx();
  const rewardAddress = useRewardAddress();
  const [error, setError] = useState<unknown>();
  const [checking, setChecking] = useState(false);
  const [accountStatus, setAccountStatus] = useState<AccountStatus>();

  const checkAccountStatus = async () => {
    try {
      setChecking(true);
      
      if (rewardAddress) {
        const status = await check(rewardAddress);
        setAccountStatus(status);
      }

      setChecking(false);
    } catch (error) {
      setError(error);
    }
  };

  const registerAddress = async () => {
    try {
      if (rewardAddress) {
        const unsignedTx = await tx
          .registerStake(rewardAddress)
          .build();

        const signedTx = await wallet.signTx(unsignedTx);
        await wallet.submitTx(signedTx);
      }
    } catch (error) {
      setError(error);
    }
  };

  const delegateStake = async () => {
    try {
      if (rewardAddress) {
        const unsignedTx = await tx
          .delegateStake(rewardAddress, poolId)
          .build();

        const signedTx = await wallet.signTx(unsignedTx);
        await wallet.submitTx(signedTx);
      }
    } catch (error) {
      setError(error);
    }
  };

  useEffect(() => {
    checkAccountStatus();
  }, [rewardAddress]);

  if (checking) {
    return <span>Checking...</span>
  }

  if (accountStatus?.active) {
    return accountStatus.poolId === poolId
      ? <span>Stake Delegated</span>
      : <span onClick={delegateStake}>Delegate Stake</span>;
  }

  return <span onClick={registerAddress}>Register Address</span>;
};
