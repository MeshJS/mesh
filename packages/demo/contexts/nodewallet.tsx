import React, { createContext, useState, useContext, useMemo } from 'react';
import { NodeWallet } from '@martifylabs/mesh';

const WalletContext = createContext({
  wallet: {} as NodeWallet,
  setWallet: (wallet: NodeWallet) => {},
  walletNetwork: 0,
  setWalletNetwork: (network: number) => {},
  walletConnected: false,
  setWalletConnected: (bool: boolean) => {},
});

export const NodeWalletProvider = ({ children }) => {
  const [wallet, setWallet] = useState<NodeWallet>({} as NodeWallet);
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

export default function useNodeWallet() {
  return useContext(WalletContext);
}
