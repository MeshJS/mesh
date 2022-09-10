import React, {
  createContext,
  useState,
  useContext,
  useMemo,
  useEffect,
} from 'react';
import { BrowserWallet } from '@martifylabs/mesh';
import type { Wallet } from '@martifylabs/mesh';

const WalletContext = createContext({
  wallet: {} as BrowserWallet,
  connecting: false,
  walletNameConnected: '',
  walletConnected: false,
  connectWallet: async (walletName: string) => {},
  availableWallets: [] as Wallet[],
  hasAvailableWallets: false,
});

export const WalletProvider = ({ children }) => {
  const [wallet, setWallet] = useState<BrowserWallet>({} as BrowserWallet);
  const [walletConnected, setWalletConnected] = useState<boolean>(false);
  const [connecting, setConnecting] = useState<boolean>(false);
  const [walletNameConnected, setWalletNameConnected] = useState<string>('');
  const [availableWallets, setAvailableWallets] = useState<Wallet[]>([]);

  useEffect(() => {
    async function init() {
      setAvailableWallets(BrowserWallet.getInstalledWallets());
    }
    init();
  }, []);
  const hasAvailableWallets = availableWallets.length > 0;

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
      availableWallets,
      hasAvailableWallets,
    }),
    [
      wallet,
      walletConnected,
      connecting,
      walletNameConnected,
      availableWallets,
      hasAvailableWallets,
    ]
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
