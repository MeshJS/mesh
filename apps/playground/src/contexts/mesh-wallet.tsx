import React, { createContext, useContext, useMemo, useState } from "react";

import { MeshWallet } from "@meshsdk/core";

import { getMeshWallet } from "~/components/cardano/mesh-wallet";

const WalletContext = createContext({
  getWallet: () => ({}) as MeshWallet,
  setWallet: (wallet: MeshWallet) => {},
  walletConnected: false,
});

export const MeshWalletProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [wallet, setWallet] = useState<MeshWallet>({} as MeshWallet);

  const walletConnected = useMemo(() => {
    return Object.keys(wallet).length == 0 ? false : true;
  }, [wallet]);

  function getWallet() {
    if (!walletConnected) {
      const _wallet = getMeshWallet();
      setWallet(_wallet);
      return _wallet;
    }
    return wallet;
  }

  const memoedValue = useMemo(
    () => ({
      getWallet,
      setWallet,
      walletConnected,
    }),
    [wallet, walletConnected],
  );

  return (
    <WalletContext.Provider value={memoedValue}>
      {children}
    </WalletContext.Provider>
  );
};

export default function useMeshWallet() {
  return useContext(WalletContext);
}
