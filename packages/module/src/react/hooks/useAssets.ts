import { useContext, useEffect, useState } from 'react';
import { WalletContext } from '@mesh/react/contexts';
import type { Asset } from '@mesh/common/types';

export const useAssets = () => {
  const [asstes, setAsstes] = useState<Asset[]>();
  const {
    hasConnectedWallet,
    connectedWalletName,
    connectedWalletInstance,
  } = useContext(WalletContext);

  useEffect(() => {
    if (hasConnectedWallet) {
      connectedWalletInstance.getAssets()
        .then(setAsstes);
    }
  }, [connectedWalletName]);

  return asstes;
};
