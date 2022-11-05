import { useEffect, useState } from 'react';
import { BrowserWallet } from '@martifylabs/mesh';
import type { Wallet } from '@martifylabs/mesh';

export const useWalletList = () => {
  const [wallets, setWallets] = useState<Wallet[]>([]);

  useEffect(() => {
    setWallets(BrowserWallet.getInstalledWallets());
  }, [])

  return wallets;
};
