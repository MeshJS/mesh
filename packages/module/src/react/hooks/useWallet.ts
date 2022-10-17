import { useContext } from 'react';
import { WalletContext } from '@mesh/react/contexts';

export const useWallet = () => {
  const {
    connectedWalletName,
    connectingWallet,
    connectWallet,
    disconnect,
    error,
  } = useContext(WalletContext);

  if (connectWallet === undefined || disconnect === undefined) {
    throw new Error(
      "Can't call useWallet outside of the WalletProvider context",
    );
  }

  return {
    name: connectedWalletName,
    connecting: connectingWallet,
    connect: connectWallet,
    disconnect,
    error,
  };
};
