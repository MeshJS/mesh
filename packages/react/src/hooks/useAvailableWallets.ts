import { BrowserWallet } from '@martifylabs/mesh';

export const useAvailableWallets = () => {
  return BrowserWallet.getInstalledWallets();
};
