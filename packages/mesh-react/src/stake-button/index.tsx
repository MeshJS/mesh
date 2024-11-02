import { useEffect, useState } from "react";

import { AccountInfo } from "@meshsdk/common";
import { Transaction } from "@meshsdk/transaction";

import { CardanoWallet } from "../cardano-wallet";
import Button from "../common/button";
import { useRewardAddress, useWallet } from "../hooks";

interface ButtonProps {
  label?: string;
  isDark?: boolean;
  poolId: string;
  onCheck: (rewardAddress: string) => Promise<AccountInfo>;
  onDelegated?: () => void;
}

export const StakeButton = ({
  label = "Stake your ADA",
  isDark = false,
  poolId,
  onCheck,
  onDelegated = undefined,
}: ButtonProps) => {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const { connected } = useWallet();

  useEffect(() => {
    setIsDarkMode(isDark);
  }, [isDark]);

  return (
    <>
      {connected ? (
        <Button isDarkMode={isDarkMode}>
          <Delegate
            poolId={poolId}
            onCheck={onCheck}
            onDelegated={onDelegated}
          />
        </Button>
      ) : (
        <CardanoWallet label={label} isDark={isDark} />
      )}
    </>
  );
};

const Delegate = ({
  poolId,
  onCheck,
  onDelegated,
}: {
  poolId: string;
  onCheck: (rewardAddress: string) => Promise<AccountInfo>;
  onDelegated?: () => void;
}) => {
  const { wallet } = useWallet();
  const rewardAddress = useRewardAddress();
  const [_, setError] = useState<unknown>();
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
        const tx = new Transaction({ initiator: wallet })
          .registerStake(rewardAddress)
          .delegateStake(rewardAddress, poolId);

        const unsignedTx = await tx.build();
        const signedTx = await wallet.signTx(unsignedTx);
        await wallet.submitTx(signedTx);

        if (onDelegated) {
          onDelegated();
        }
        setDone(true);
      }
    } catch (error) {
      setError(error);
    }
    setProcessing(false);
  };

  const delegateStake = async () => {
    setProcessing(true);
    setDone(false);
    try {
      if (rewardAddress) {
        const tx = new Transaction({ initiator: wallet })
          .delegateStake(rewardAddress, poolId);

        const unsignedTx = await tx.build();
        const signedTx = await wallet.signTx(unsignedTx);
        await wallet.submitTx(signedTx);

        if (onDelegated) {
          onDelegated();
        }
        setDone(true);
      }
    } catch (error) {
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
      <span onClick={delegateStake}>Begin Staking</span>
    );
  }

  return <span onClick={registerAddress}>Begin Staking</span>;
};
