import { AppWalletProvider } from "./app-wallet";
import { MeshWalletProvider } from "./mesh-wallet";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AppWalletProvider>
      <MeshWalletProvider>{children}</MeshWalletProvider>
    </AppWalletProvider>
  );
}
