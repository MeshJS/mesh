import React, {
  createContext,
  useState,
  useContext,
  useMemo,
  ReactNode,
} from 'react';
import { BrowserWallet } from '@martifylabs/mesh';

const WalletContext = createContext({
  wallet: {} as BrowserWallet,
  connecting: false,
  walletNameConnected: '',
  walletConnected: false,
  connectWallet: async (walletName: string) => {},
});

export const WalletProvider = ({ children }: { children: ReactNode }) => {
  const [wallet, setWallet] = useState<BrowserWallet>({} as BrowserWallet);
  const [walletConnected, setWalletConnected] = useState<boolean>(false);
  const [connecting, setConnecting] = useState<boolean>(false);
  const [walletNameConnected, setWalletNameConnected] = useState<string>('');

  const connectWallet = async (walletName: string) => {
    setConnecting(true);
    const _wallet = await BrowserWallet.enable(walletName);
    if (_wallet) {
      setWallet(_wallet);
      setWalletNameConnected(walletName);
      setWalletConnected(true);
    }
    setConnecting(false);
  };

  const memoedValue = useMemo(
    () => ({
      wallet,
      connecting,
      walletNameConnected,
      walletConnected,
      connectWallet,
    }),
    [wallet, walletConnected, connecting, walletNameConnected]
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
