import { useEffect, useState } from 'react';
import { BrowserWallet } from '@meshsdk/core';
import type { Wallet } from '@meshsdk/core';

export const useWalletList = () => {
  const [wallets, setWallets] = useState<Wallet[]>([]);

  useEffect(() => {
    setWallets(BrowserWallet.getInstalledWallets());
  }, []);

  return wallets;
};
