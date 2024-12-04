import { useContext, useEffect, useState } from "react";

import { WalletContext } from "../contexts";

export const useRewardAddress = (accountId = 0) => {
  const [rewardAddress, setRewardAddress] = useState<string>();
  const { hasConnectedWallet, connectedWalletInstance } =
    useContext(WalletContext);

  useEffect(() => {
    if (hasConnectedWallet) {
      connectedWalletInstance.getRewardAddresses().then((addresses) => {
        if (addresses[accountId]) {
          setRewardAddress(addresses[accountId]);
        }
      });
    }
  }, [accountId, hasConnectedWallet, connectedWalletInstance]);

  return rewardAddress;
};
