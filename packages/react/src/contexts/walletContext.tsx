import { createContext, useCallback, useState } from 'react';
import { BrowserWallet } from '@martifylabs/mesh';
import { useLocalStorage } from '@mesh/utils';

const INITIAL_STATE = {
  walletInstance: {} as BrowserWallet,
  walletName: '',
};

interface WalletContext {
  hasConnectedWallet: boolean,
  connectedWalletInstance: BrowserWallet,
  connectedWalletName: string,
  connectingWallet: boolean,
  connectWallet?: (walletName: string) => Promise<void>,
  disconnect?: () => void,
  error?: unknown,
}

const useWalletStore = () => {
  const [error, setError] = useState<unknown>(undefined);

  const [meshStorage, setMeshStorage] =
    useLocalStorage('meshWallet', INITIAL_STATE);

  const [connectingWallet, setConnectingWallet] =
    useState<boolean>(false);

  const [connectedWalletInstance, setConnectedWalletInstance] =
    useState<BrowserWallet>(meshStorage.walletInstance);

  const [connectedWalletName, setConnectedWalletName] =
    useState<string>(meshStorage.walletName);

  const connectWallet = useCallback(async (walletName: string) => {
    setConnectingWallet(true);

    try {
      const walletInstance = await BrowserWallet.enable(walletName);
      setConnectedWalletInstance(walletInstance);
      setConnectedWalletName(walletName);
      setError(undefined);
      setMeshStorage({
        walletInstance,
        walletName,
      });
    } catch (error) {
      setError(error);
      console.error(error);
    }

    setConnectingWallet(false);
  }, []);

  const disconnect = useCallback(() => {
    setMeshStorage(INITIAL_STATE);
    setConnectedWalletName(INITIAL_STATE.walletName);
    setConnectedWalletInstance(INITIAL_STATE.walletInstance);
  }, []);

  return {
    hasConnectedWallet: Object.keys(connectedWalletInstance).length > 0,
    connectedWalletInstance,
    connectedWalletName,
    connectingWallet,
    connectWallet,
    disconnect,
    error,
  };
};

export const WalletContext = createContext<WalletContext>({
  hasConnectedWallet: false,
  connectedWalletInstance: INITIAL_STATE.walletInstance,
  connectedWalletName: INITIAL_STATE.walletName,
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
