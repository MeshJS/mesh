import { useEffect, useState } from 'react';
import { BrowserWallet } from 'meshjs';
import type { Wallet } from 'meshjs';

export const useWalletList = () => {
  const [wallets, setWallets] = useState<Wallet[]>([]);

  useEffect(() => {
    setWallets(BrowserWallet.getInstalledWallets());
  }, []);

  return wallets;
};
