export { WalletContext } from './WalletContext';

import { useWalletStore, WalletContext } from './WalletContext';

export const MeshProvider = ({ children }) => {
  const store = useWalletStore();

  return (
    <WalletContext.Provider value={store}>
      {children}
    </WalletContext.Provider>
  );
};
