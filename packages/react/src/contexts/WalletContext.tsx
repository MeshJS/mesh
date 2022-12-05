import { createContext, useCallback, useState } from 'react';
import { BrowserWallet } from '@meshsdk/core';

interface WalletContext {
  hasConnectedWallet: boolean,
  connectedWalletInstance: BrowserWallet,
  connectedWalletName: string,
  connectingWallet: boolean,
  connectWallet?: (walletName: string) => Promise<void>,
  disconnect?: () => void,
  error?: unknown,
}

const INITIAL_STATE = {
  walletName: '', walletInstance: {} as BrowserWallet,
};

export const useWalletStore = () => {
  const [error, setError] = useState<unknown>(undefined);

  const [connectingWallet, setConnectingWallet] =
    useState<boolean>(false);

  const [connectedWalletInstance, setConnectedWalletInstance] =
    useState<BrowserWallet>(INITIAL_STATE.walletInstance);

  const [connectedWalletName, setConnectedWalletName] =
    useState<string>(INITIAL_STATE.walletName);

  const connectWallet = useCallback(async (walletName: string) => {
    setConnectingWallet(true);

    try {
      const walletInstance = await BrowserWallet.enable(walletName);
      setConnectedWalletInstance(walletInstance);
      setConnectedWalletName(walletName);
      setError(undefined);
    } catch (error) {
      setError(error);
      console.error(error);
    }

    setConnectingWallet(false);
  }, []);

  const disconnect = useCallback(() => {
    setConnectedWalletName(INITIAL_STATE.walletName);
    setConnectedWalletInstance(INITIAL_STATE.walletInstance);
  }, []);

  return {
    hasConnectedWallet: INITIAL_STATE.walletName !== connectedWalletName,
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
