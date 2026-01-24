import { useWalletStore, WalletContext } from "./WalletContext";

export { WalletContext } from "./WalletContext";

interface Props {
  children: React.ReactNode;
}

export const MeshProvider: React.FC<Props> = ({ children }) => {
  const store = useWalletStore();
  return (
    <WalletContext.Provider value={store}>
      <>{children}</>
    </WalletContext.Provider>
  );
};
