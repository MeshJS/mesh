import { useEffect, useState } from 'react';
import { BrowserWallet } from '@meshjs/core';
import type { Wallet } from '@meshjs/core';

export const useWalletList = () => {
  const [wallets, setWallets] = useState<Wallet[]>([]);

  useEffect(() => {
    setWallets(BrowserWallet.getInstalledWallets());
  }, []);

  return wallets;
};
