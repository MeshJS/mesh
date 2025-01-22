import { createContext, useCallback, useEffect, useState } from "react";

import { IWallet } from "@meshsdk/common";
import { BrowserWallet } from "@meshsdk/wallet";

interface WalletContext {
  hasConnectedWallet: boolean;
  connectedWalletInstance: IWallet;
  connectedWalletName: string | undefined;
  connectingWallet: boolean;
  connectWallet: (
    walletName: string,
    extensions?: number[],
    persist?: boolean,
  ) => Promise<void>;
  disconnect: () => void;
  setWallet: (walletInstance: IWallet, walletName: string) => void;
  setPersist: (persist: boolean) => void;
  error?: unknown;
}

const INITIAL_STATE = {
  walletName: undefined,
  walletInstance: {} as IWallet,
};

const localstoragePersist = "mesh-persist";

export const useWalletStore = () => {
  const [error, setError] = useState<unknown>(undefined);
  const [connectingWallet, setConnectingWallet] = useState<boolean>(false);
  const [persistSession, setPersistSession] = useState<boolean>(false);

  const [connectedWalletInstance, setConnectedWalletInstance] =
    useState<IWallet>(INITIAL_STATE.walletInstance);

  const [connectedWalletName, setConnectedWalletName] = useState<
    string | undefined
  >(INITIAL_STATE.walletName);

  const connectWallet = useCallback(
    async (walletName: string, extensions?: number[], persist?: boolean) => {
      setConnectingWallet(true);

      try {
        const walletInstance = await BrowserWallet.enable(
          walletName,
          extensions,
        );
        setConnectedWalletInstance(walletInstance);
        setConnectedWalletName(walletName);
        if (persist) {
          localStorage.setItem(
            localstoragePersist,
            JSON.stringify({ walletName }),
          );
        }
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
    localStorage.removeItem(localstoragePersist);
  }, []);

  const setWallet = useCallback(
    async (walletInstance: IWallet, walletName: string) => {
      setConnectedWalletInstance(walletInstance);
      setConnectedWalletName(walletName);
    },
    [],
  );

  const setPersist = useCallback((persist: boolean) => {
    setPersistSession(persist);
  }, []);

  useEffect(() => {
    const persist = localStorage.getItem(localstoragePersist);
    if (persistSession && persist) {
      const persist = JSON.parse(
        localStorage.getItem(localstoragePersist) || "",
      );
      connectWallet(persist.walletName);
    }
  }, [persistSession]);

  return {
    hasConnectedWallet: INITIAL_STATE.walletName !== connectedWalletName,
    connectedWalletInstance,
    connectedWalletName,
    connectingWallet,
    connectWallet,
    disconnect,
    setWallet,
    setPersist,
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
  setPersist: () => {},
});
