import React, { createContext, useState, useContext, useMemo } from 'react';
import { AppWallet } from '@meshsdk/core';

const WalletContext = createContext({
  wallet: {} as AppWallet,
  setWallet: (wallet: AppWallet) => {},
  walletNetwork: 0,
  setWalletNetwork: (network: number) => {},
  walletConnected: false,
});

export const AppWalletProvider = ({ children }) => {
  const [wallet, setWallet] = useState<AppWallet>({} as AppWallet);
  const [walletNetwork, setWalletNetwork] = useState<number>(0);

  const walletConnected = useMemo(() => {
    return Object.keys(wallet).length == 0 ? false : true;
  }, [wallet]);

  const memoedValue = useMemo(
    () => ({
      wallet,
      setWallet,
      walletNetwork,
      setWalletNetwork,
      walletConnected,
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
