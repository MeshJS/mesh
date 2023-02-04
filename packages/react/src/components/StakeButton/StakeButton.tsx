import tw, { styled } from 'twin.macro';
import { useEffect, useState } from 'react';
import {
  useRewardAddress,
  useWallet,
  useWalletList,
  useWalletTx,
} from '@mesh/hooks';
import { ChevronDown } from '../ChevronDown';
import { MenuItem } from '../MenuItem';
import type { AccountInfo } from '@meshsdk/core';

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

export const StakeButton = ({ poolId, onCheck }) => {
  const wallets = useWalletList();

  const [hideMenuList, setHideMenuList] = useState(true);

  const { connect, connecting, connected, name } = useWallet();

  return (
    <div
      style={{ width: 'fit-content' }}
      onMouseEnter={() => setHideMenuList(false)}
      onMouseLeave={() => setHideMenuList(true)}
    >
      <StyledMenuButton
        type="button"
        onClick={() => setHideMenuList(!hideMenuList)}
      >
        {connected ? (
          <Delegate poolId={poolId} onCheck={onCheck} />
        ) : connecting ? (
          <>Connecting...</>
        ) : (
          <>
            Connect Wallet <ChevronDown />
          </>
        )}
      </StyledMenuButton>
      <StyledMenuList hidden={hideMenuList || connected}>
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

const Delegate = ({ poolId, onCheck }) => {
  const tx = useWalletTx();
  const { wallet } = useWallet();
  const rewardAddress = useRewardAddress();
  const [error, setError] = useState<unknown>();
  const [checking, setChecking] = useState(false);
  const [accountInfo, setAccountInfo] = useState<AccountInfo>();
  const [processing, setProcessing] = useState(false);
  const [done, setDone] = useState(false);

  const checkAccountStatus = async () => {
    try {
      setChecking(true);

      if (rewardAddress) {
        const info = await onCheck(rewardAddress);
        setAccountInfo(info);
      }

      setChecking(false);
    } catch (error) {
      setError(error);
    }
  };

  const registerAddress = async () => {
    setProcessing(true);
    setDone(false);
    try {
      if (rewardAddress) {
        const unsignedTx = await tx
          .registerStake(rewardAddress)
          .delegateStake(rewardAddress, poolId)
          .build();

        const signedTx = await wallet.signTx(unsignedTx);
        const txHash = await wallet.submitTx(signedTx);
        console.log('txHash', txHash);
        setDone(true);
      }
    } catch (error) {
      console.error('error', error);
      setError(error);
    }
    setProcessing(false);
  };

  const delegateStake = async () => {
    setProcessing(true);
    setDone(false);
    try {
      if (rewardAddress) {
        const unsignedTx = await tx
          .delegateStake(rewardAddress, poolId)
          .build();

        const signedTx = await wallet.signTx(unsignedTx);
        const txHash = await wallet.submitTx(signedTx);
        setDone(true);
      }
    } catch (error) {
      console.error('error', error);
      setError(error);
    }
    setProcessing(false);
  };

  useEffect(() => {
    checkAccountStatus();
  }, [rewardAddress]);

  if (checking) {
    return <span>Checking...</span>;
  }
  if (processing) {
    return <span>Loading...</span>;
  }
  if (done) {
    return <span>Stake Delegated</span>;
  }

  if (accountInfo?.active) {
    return accountInfo.poolId === poolId ? (
      <span>Stake Delegated</span>
    ) : (
      <span onClick={delegateStake}>Delegate Stake</span>
    );
  }

  return <span onClick={registerAddress}>Register Address</span>;
};
