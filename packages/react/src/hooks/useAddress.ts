import { useContext, useEffect, useState } from 'react';
import { WalletContext } from '@mesh/contexts';

export const useAddress = (accountId = 0) => {
  const [address, setAddress] = useState<string>();
  const {
    hasConnectedWallet,
    connectedWalletName,
    connectedWalletInstance,
  } = useContext(WalletContext);

  useEffect(() => {
    if (hasConnectedWallet) {
      connectedWalletInstance.getUsedAddresses().then((addresses) => {
        if (addresses[accountId]) {
          setAddress(addresses[accountId]);
        }
      });
    }
  }, [accountId, connectedWalletName]);

  return address;
};
