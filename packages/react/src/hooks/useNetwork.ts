import { useContext, useEffect, useState } from 'react';
import { WalletContext } from '@mesh/contexts';

export const useNetwork = () => {
  const [networkId, setNetworkId] = useState<number>();
  const {
    hasConnectedWallet,
    connectedWalletName,
    connectedWalletInstance,
  } = useContext(WalletContext);

  useEffect(() => {
    if (hasConnectedWallet) {
      connectedWalletInstance.getNetworkId()
        .then(setNetworkId);
    }
  }, [connectedWalletName]);

  return networkId;
};
