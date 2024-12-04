import { createContext, useCallback, useState } from "react";

import { IWallet } from "@meshsdk/common";
import { BrowserWallet } from "@meshsdk/wallet";

interface WalletContext {
  hasConnectedWallet: boolean;
  connectedWalletInstance: IWallet;
  connectedWalletName: string | undefined;
  connectingWallet: boolean;
  connectWallet: (walletName: string, extensions?: number[]) => Promise<void>;
  disconnect: () => void;
  setWallet: (walletInstance: IWallet, walletName: string) => void;
  error?: unknown;
}

const INITIAL_STATE = {
  walletName: undefined,
  walletInstance: {} as IWallet,
};

export const useWalletStore = () => {
  const [error, setError] = useState<unknown>(undefined);

  const [connectingWallet, setConnectingWallet] = useState<boolean>(false);

  const [connectedWalletInstance, setConnectedWalletInstance] =
    useState<IWallet>(INITIAL_STATE.walletInstance);

  const [connectedWalletName, setConnectedWalletName] = useState<
    string | undefined
  >(INITIAL_STATE.walletName);

  const connectWallet = useCallback(
    async (walletName: string, extensions?: number[]) => {
      setConnectingWallet(true);

      try {
        const walletInstance = await BrowserWallet.enable(
          walletName,
          extensions,
        );
        setConnectedWalletInstance(walletInstance);
        setConnectedWalletName(walletName);
        setError(undefined);
      } catch (error) {
        setError(error);
      }

      setConnectingWallet(false);
    },
    [],
  );

  const disconnect = useCallback(() => {
    setConnectedWalletName(INITIAL_STATE.walletName);
    setConnectedWalletInstance(INITIAL_STATE.walletInstance);
  }, []);

  const setWallet = useCallback(
    async (walletInstance: IWallet, walletName: string) => {
      setConnectedWalletInstance(walletInstance);
      setConnectedWalletName(walletName);
    },
    [],
  );

  return {
    hasConnectedWallet: INITIAL_STATE.walletName !== connectedWalletName,
    connectedWalletInstance,
    connectedWalletName,
    connectingWallet,
    connectWallet,
    disconnect,
    setWallet,
    error,
  };
};

export const WalletContext = createContext<WalletContext>({
  hasConnectedWallet: false,
  connectedWalletInstance: INITIAL_STATE.walletInstance,
  connectedWalletName: INITIAL_STATE.walletName,
  connectingWallet: false,
  connectWallet: async () => {},
  disconnect: () => {},
  setWallet: async () => {},
});
