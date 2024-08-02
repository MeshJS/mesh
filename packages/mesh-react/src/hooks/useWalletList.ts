import { useEffect, useState } from "react";

import type { Wallet } from "@meshsdk/common";
import { BrowserWallet } from "@meshsdk/wallet";

export const useWalletList = () => {
  const [wallets, setWallets] = useState<Wallet[]>([]);

  useEffect(() => {
    setWallets(BrowserWallet.getInstalledWallets());
  }, []);

  return wallets;
};
