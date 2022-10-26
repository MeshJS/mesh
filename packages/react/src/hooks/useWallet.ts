import { useContext } from 'react';
import { WalletContext } from '@mesh/contexts';

export const useWallet = () => {
  const {
    hasConnectedWallet,
    connectedWalletName,
    connectingWallet,
    connectWallet,
    disconnect,
    error,
  } = useContext(WalletContext);

  if (connectWallet === undefined || disconnect === undefined) {
    throw new Error(
      'Can\'t call useWallet outside of the WalletProvider context',
    );
  }

  return {
    connected: hasConnectedWallet,
    name: connectedWalletName,
    connecting: connectingWallet,
    connect: connectWallet,
    disconnect,
    error,
  };
};
