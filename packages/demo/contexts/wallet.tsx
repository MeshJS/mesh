import React, { createContext, useState, useContext, useMemo } from 'react';
import Mesh from '@martifylabs/mesh';

const WalletContext = createContext({
  connecting: false,
  walletNameConnected: '',
  walletConnected: false,
  connectWallet: async (walletName: string) => {},
});

export const WalletProvider = ({ children }) => {
  const [walletConnected, setWalletConnected] = useState<boolean>(false);
  const [connecting, setConnecting] = useState<boolean>(false);
  const [walletNameConnected, setWalletNameConnected] = useState<string>('');

  const connectWallet = async (walletName: string) => {
    setConnecting(true);
    const walletConnected = await Mesh.wallet.enable({
      walletName: walletName,
    });
    if (walletConnected) {
      setWalletNameConnected(walletName);
      setWalletConnected(true);
    }
    setConnecting(false);
  };

  const memoedValue = useMemo(
    () => ({
      connecting,
      walletNameConnected,
      walletConnected,
      connectWallet,
    }),
    [walletConnected, connecting, walletNameConnected]
  );

  return (
    <WalletContext.Provider value={memoedValue}>
      {children}
    </WalletContext.Provider>
  );
};

export default function useWallet() {
  return useContext(WalletContext);
}
