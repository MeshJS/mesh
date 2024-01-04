export { WalletContext } from './WalletContext';

import { useWalletStore, WalletContext } from './WalletContext';

interface Props {
  children: React.ReactNode;
}

export const MeshProvider: React.FC<Props> = (
  props: any,
  deprecatedLegacyContext?: any
) => {
  const store = useWalletStore();
  return (
    <WalletContext.Provider value={store}>
      <>{props.children}</>
    </WalletContext.Provider>
  );
};
