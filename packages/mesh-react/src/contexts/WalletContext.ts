import { createContext, useCallback, useEffect, useState } from "react";

import { IWallet } from "@meshsdk/common";
import { BrowserWallet } from "@meshsdk/wallet";
import { EnableWeb3WalletOptions, UserSocialData } from "@utxos/sdk";

interface WalletContext {
  hasConnectedWallet: boolean;
  connectedWalletInstance: IWallet;
  connectedWalletName: string | undefined;
  connectingWallet: boolean;
  connectWallet: (walletName: string, persist?: boolean) => Promise<void>;
  disconnect: () => void;
  setWallet: (
    walletInstance: IWallet,
    walletName: string,
    persist?: {
      [key: string]: any;
    },
  ) => void;
  setPersist: (persist: boolean) => void;
  setWeb3Services: (web3Services: EnableWeb3WalletOptions | undefined) => void;
  web3UserData: UserSocialData | undefined;
  setWeb3UserData: (web3UserData: UserSocialData | undefined) => void;
  error?: unknown;
  address: string;
  state: WalletState;
}

export enum WalletState {
  NOT_CONNECTED = "NOT_CONNECTED",
  CONNECTING = "CONNECTING",
  CONNECTED = "CONNECTED",
}

const INITIAL_STATE = {
  walletName: undefined,
  walletInstance: {} as IWallet,
};

const localstoragePersist = "mesh-wallet-persist";

export const useWalletStore = () => {
  const [error, setError] = useState<unknown>(undefined);
  const [state, setState] = useState<WalletState>(WalletState.NOT_CONNECTED);
  const [connectingWallet, setConnectingWallet] = useState<boolean>(false);
  const [persistSession, setPersistSession] = useState<boolean>(false);
  const [address, setAddress] = useState("");
  const [connectedWalletInstance, setConnectedWalletInstance] =
    useState<IWallet>(INITIAL_STATE.walletInstance);
  const [connectedWalletName, setConnectedWalletName] = useState<
    string | undefined
  >(INITIAL_STATE.walletName);
  const [web3Services, setWeb3Services] = useState<
    EnableWeb3WalletOptions | undefined
  >(undefined);
  const [web3UserData, setWeb3UserData] = useState<UserSocialData | undefined>(
    undefined,
  );
  const connectWallet = useCallback(
    async (walletName: string, persist?: boolean) => {
      setConnectingWallet(true);
      setState(WalletState.CONNECTING);

      try {
        const extensions = BrowserWallet.getSupportedExtensions(walletName);
        const walletInstance = await BrowserWallet.enable(
          walletName,
          extensions,
        );
        setConnectedWalletInstance(walletInstance);
        setConnectedWalletName(walletName);
        setError(undefined);

        // if persist, set localstorage
        if (persist) {
          localStorage.setItem(
            localstoragePersist,
            JSON.stringify({ walletName }),
          );
        }
        setState(WalletState.CONNECTED);
      } catch (error) {
        setError(error);
        setState(WalletState.NOT_CONNECTED);
        setConnectedWalletName(INITIAL_STATE.walletName);
        setConnectedWalletInstance(INITIAL_STATE.walletInstance);
      }

      setConnectingWallet(false);
    },
    [],
  );

  const disconnect = useCallback(() => {
    setConnectedWalletName(INITIAL_STATE.walletName);
    setConnectedWalletInstance(INITIAL_STATE.walletInstance);
    setState(WalletState.NOT_CONNECTED);
    localStorage.removeItem(localstoragePersist);
  }, []);

  const setWallet = useCallback(
    async (
      walletInstance: IWallet,
      walletName: string,
      persist?: { [key: string]: any },
    ) => {
      setConnectedWalletInstance(walletInstance);
      setConnectedWalletName(walletName);
      setState(WalletState.CONNECTED);

      if (persist) {
        localStorage.setItem(
          localstoragePersist,
          JSON.stringify({ walletName, ...persist }),
        );
      }
    },
    [],
  );

  const setPersist = useCallback((persist: boolean) => {
    setPersistSession(persist);
  }, []);

  // after connected
  useEffect(() => {
    async function load() {
      if (
        Object.keys(connectedWalletInstance).length > 0 &&
        address.length === 0
      ) {
        let address = (await connectedWalletInstance.getUnusedAddresses())[0];
        if (!address)
          address = await connectedWalletInstance.getChangeAddress();
        setAddress(address);
      }
    }
    load();
  }, [connectedWalletInstance]);

  // if persist
  useEffect(() => {
    const persistData = localStorage.getItem(localstoragePersist);
    if (persistSession && persistData) {
      try {
        const persist = JSON.parse(persistData);

        // Validate required field exists
        if (!persist || typeof persist.walletName !== "string") {
          throw new Error("Invalid persist data structure");
        }

        // Web3Wallet session restoration requires re-authentication
        // as the API now requires keyHashes instead of just an address
        if (persist.walletName === "utxos") {
          // Clear the persist data since we can't restore web3 wallet sessions
          // Users will need to re-authenticate with web3 services
          localStorage.removeItem(localstoragePersist);
        } else {
          connectWallet(persist.walletName);
        }
      } catch (error) {
        // Clear corrupted persist data to prevent repeated failures
        console.error("Failed to restore wallet session:", error);
        localStorage.removeItem(localstoragePersist);
      }
    }
  }, [persistSession, connectWallet]);

  return {
    hasConnectedWallet: INITIAL_STATE.walletName !== connectedWalletName,
    connectedWalletInstance,
    connectedWalletName,
    connectingWallet,
    connectWallet,
    disconnect,
    setWallet,
    setPersist,
    setWeb3Services,
    web3UserData,
    setWeb3UserData,
    error,
    address,
    state,
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
  setWeb3Services: () => {},
  web3UserData: undefined,
  setWeb3UserData: () => {},
  address: "",
  state: WalletState.NOT_CONNECTED,
});
