import { createContext, useCallback, useState } from 'react';
import { useLocalStorage } from '@mesh/react/utils';
import { BrowserWallet } from '@mesh/wallet';

interface WalletContext {
  hasAvailableWallets: boolean,
  hasConnectedWallet: boolean,
  connectedWalletInstance: BrowserWallet,
  connectedWalletName: string,
  connectingWallet: boolean,
  connectWallet?: (walletName: string) => Promise<void>,
  disconnect?: () => void,
}

const defaultWallet = {
  walletInstance: {} as BrowserWallet,
  walletName: '',
};

const [meshStorage, setMeshStorage] = useLocalStorage<{
  walletInstance: BrowserWallet;
  walletName: string;
}>('meshBrowserWallet', defaultWallet);

const useWalletStore = () => {
  const [connectingWallet, setConnectingWallet] = useState<boolean>(false);

  const [connectedWalletInstance, setConnectedWalletInstance] =
  useState<BrowserWallet>(meshStorage.walletInstance);

  const [connectedWalletName, setConnectedWalletName] =
  useState<string>(meshStorage.walletName);
  
  const connectWallet = useCallback(async (walletName: string) => {
    setConnectingWallet(true);
    
    try {
      const walletInstance = await BrowserWallet.enable(walletName);
      setConnectedWalletName(walletName);
      setConnectedWalletInstance(walletInstance);
      setMeshStorage({
        walletInstance,
        walletName,
      });
    } catch (error) {
      console.error(error);
    }
    
    setConnectingWallet(false);
  }, []);

  const disconnect = useCallback(() => {
    setMeshStorage(defaultWallet);
    setConnectedWalletName(defaultWallet.walletName);
    setConnectedWalletInstance(defaultWallet.walletInstance);
  }, []);

  return {
    hasAvailableWallets: BrowserWallet.getInstalledWallets().length > 0,
    hasConnectedWallet: Object.keys(connectedWalletInstance).length > 0,
    connectedWalletInstance,
    connectedWalletName,
    connectingWallet,
    connectWallet,
    disconnect,
  };
};

export const WalletContext = createContext<WalletContext>({
  hasAvailableWallets: BrowserWallet.getInstalledWallets().length > 0,
  hasConnectedWallet: Object.keys(meshStorage.walletInstance).length > 0,
  connectedWalletInstance: meshStorage.walletInstance,
  connectedWalletName: meshStorage.walletName,
  connectingWallet: false,
});

export const WalletProvider = ({ children }) => {
  const store = useWalletStore();

  return (
    <WalletContext.Provider value={store}>
      {children}
    </WalletContext.Provider>
  );
};
