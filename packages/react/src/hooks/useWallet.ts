import { useContext } from 'react';
import { WalletContext } from '@mesh/contexts';

export const useWallet = () => {
  const {
    hasConnectedWallet,
    connectedWalletName,
    connectedWalletInstance,
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
    instance: connectedWalletInstance,
    connect: connectWallet,
    disconnect,
    error,
  };
};
