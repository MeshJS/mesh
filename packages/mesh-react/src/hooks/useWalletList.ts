import { useEffect, useState } from "react";

import type { Wallet } from "@meshsdk/common";
import { BrowserWallet } from "@meshsdk/wallet";

export const useWalletList = ({
  nufiNetwork = "preprod",
}: {
  nufiNetwork?: string;
} = {}) => {
  const [wallets, setWallets] = useState<Wallet[]>([]);

  useEffect(() => {
    async function get() {
      setWallets(await BrowserWallet.getAvailableWallets({ nufiNetwork }));
    }
    get();
  }, []);

  return wallets;
};
