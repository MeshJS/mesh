import React, {
  createContext,
  useState,
  useContext,
  useMemo,
  useEffect,
} from 'react';
import { BrowserWallet } from '@meshsdk/core';
import type { Wallet } from '@meshsdk/core';
import useLocalStorage from '../hooks/useLocalStorage';

const WalletContext = createContext({
  wallet: {} as BrowserWallet,
  connecting: false,
  walletNameConnected: '',
  walletConnected: false,
  connectWallet: async (walletName: string) => {},
  availableWallets: [] as Wallet[],
  hasAvailableWallets: false,
  userStorage: { lockedAssetUnit: '' },
  updateUserStorage: (key, value) => {},
});

export const WalletProvider = ({ children }) => {
  const [wallet, setWallet] = useState<BrowserWallet>({} as BrowserWallet);
  const [walletConnected, setWalletConnected] = useState<boolean>(false);
  const [connecting, setConnecting] = useState<boolean>(false);
  const [walletNameConnected, setWalletNameConnected] = useState<string>('');
  const [availableWallets, setAvailableWallets] = useState<Wallet[]>([]);
  const [userLocalStorage, setUserlocalStorage] = useLocalStorage(
    'meshUserStorage',
    {}
  );
  const [userStorage, setUserStorage] = useState<{ lockedAssetUnit: '' }>(
    userLocalStorage
  );

  useEffect(() => {
    async function init() {
      setAvailableWallets(BrowserWallet.getInstalledWallets());
    }
    init();
  }, []);
  const hasAvailableWallets = availableWallets.length > 0;

  const connectWallet = async (walletName: string) => {
    setConnecting(true);
    try {
      const _wallet = await BrowserWallet.enable(walletName);
      if (_wallet) {
        setWallet(_wallet);
        setWalletNameConnected(walletName);
        setWalletConnected(true);
      }
    } catch (error) {
      console.error('connectWallet', error);
    }
    setConnecting(false);
  };

  function updateUserStorage(key, value) {
    let updateUserStorage = { ...userStorage };
    if (value) {
      updateUserStorage[key] = value;
    } else {
      delete updateUserStorage[key];
    }
    setUserStorage(updateUserStorage);
    setUserlocalStorage(updateUserStorage);
  }

  const memoedValue = useMemo(
    () => ({
      wallet,
      connecting,
      walletNameConnected,
      walletConnected,
      connectWallet,
      availableWallets,
      hasAvailableWallets,
      userStorage,
      updateUserStorage,
    }),
    [
      wallet,
      walletConnected,
      connecting,
      walletNameConnected,
      availableWallets,
      hasAvailableWallets,
      userStorage,
      updateUserStorage,
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
