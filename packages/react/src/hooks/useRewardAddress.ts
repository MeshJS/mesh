import { useContext, useEffect, useState } from 'react';
import { WalletContext } from '@mesh/contexts';

export const useRewardAddress = (accountId = 0) => {
  const [rewardAddress, setRewardAddress] = useState<string>();
  const {
    hasConnectedWallet,
    connectedWalletName,
    connectedWalletInstance,
  } = useContext(WalletContext);

  useEffect(() => {
    if (hasConnectedWallet) {
      connectedWalletInstance.getRewardAddresses().then((addresses) => {
        if (addresses[accountId]) {
          setRewardAddress(addresses[accountId]);
        }
      });
    }
  }, [accountId, connectedWalletName]);

  return rewardAddress;
};
