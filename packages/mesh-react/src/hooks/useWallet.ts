import { useContext } from "react";

import { WalletContext } from "../contexts";

export const useWallet = () => {
  const {
    hasConnectedWallet,
    connectedWalletName,
    connectedWalletInstance,
    connectingWallet,
    connectWallet,
    disconnect,
    setWallet,
    setBitcoinWallet,
    setPersist,
    setWeb3Services,
    web3UserData,
    setWeb3UserData,
    error,
    address,
    state,
  } = useContext(WalletContext);

  if (connectWallet === undefined || disconnect === undefined) {
    throw new Error(
      "Can't call useWallet outside of the WalletProvider context",
    );
  }

  return {
    name: connectedWalletName,
    connecting: connectingWallet,
    connected: hasConnectedWallet,
    wallet: connectedWalletInstance,
    connect: connectWallet,
    disconnect,
    setWallet,
    setBitcoinWallet,
    setPersist,
    setWeb3Services,
    web3UserData,
    setWeb3UserData,
    error,
    address,
    state,
  };
};
