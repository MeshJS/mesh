import React, { createContext, useState, useContext, useMemo } from 'react';
import { AppWallet } from '@martifylabs/mesh';

const WalletContext = createContext({
  wallet: {} as AppWallet,
  setWallet: (wallet: AppWallet) => {},
  walletNetwork: 0,
  setWalletNetwork: (network: number) => {},
  walletConnected: false,
  setWalletConnected: (bool: boolean) => {},
});

export const AppWalletProvider = ({ children }) => {
  const [wallet, setWallet] = useState<AppWallet>({} as AppWallet);
  const [walletNetwork, setWalletNetwork] = useState<number>(0);
  const [walletConnected, setWalletConnected] = useState<boolean>(false);

  // const walletConnected = wallet != {}; // TODO help

  const memoedValue = useMemo(
    () => ({
      wallet,
      setWallet,
      walletNetwork,
      setWalletNetwork,
      walletConnected,
      setWalletConnected,
    }),
    [wallet, walletNetwork, walletConnected]
  );

  return (
    <WalletContext.Provider value={memoedValue}>
      {children}
    </WalletContext.Provider>
  );
};

export default function useAppWallet() {
  return useContext(WalletContext);
}
