import { useEffect, useState } from "react";

import type { Wallet } from "@meshsdk/common";
import { BrowserWallet } from "@meshsdk/wallet";

export const useWalletList = ({
  injectFn = undefined,
}: {
  injectFn?: () => Promise<void>;
} = {}) => {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  useEffect(() => {
    async function get() {
      setWallets(await BrowserWallet.getAvailableWallets({ injectFn }));
    }
    get();
  }, []);

  return wallets;
};
