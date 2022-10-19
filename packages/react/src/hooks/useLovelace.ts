import { useContext, useEffect, useState } from 'react';
import { WalletContext } from '@mesh/contexts';

export const useLovelace = () => {
  const [lovelace, setLovelace] = useState<string>();
  const {
    hasConnectedWallet,
    connectedWalletName,
    connectedWalletInstance,
  } = useContext(WalletContext);

  useEffect(() => {
    if (hasConnectedWallet) {
      connectedWalletInstance.getLovelace()
        .then(setLovelace);
    }
  }, [connectedWalletName]);

  return lovelace;
};
