import { BrowserWallet } from '@mesh/wallet';

export const useAvailableWallets = () => {
  return BrowserWallet.getInstalledWallets();
};
