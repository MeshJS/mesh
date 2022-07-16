import { useEffect, useState } from "react";
import Mesh from "@martifylabs/mesh";
import { Button } from "../../components";

export default function ConnectWallet({ walletConnected, setWalletConnected }) {
  const [availableWallets, setAvailableWallets] = useState<string[]>([]);

  useEffect(() => {
    async function getWallets() {
      setAvailableWallets(await Mesh.wallet.getAvailableWallets());
    }
    getWallets();
  }, []);

  async function connectWallet(walletName: string) {
    let connected = await Mesh.wallet.enable({ walletName: walletName });
    if (connected) {
      setWalletConnected(walletName);
    }
  }

  return (
    <>
      <h2>Connect available wallets</h2>
      {availableWallets.map((walletName, i) => (
        <Button
          key={walletName}
          onClick={() => connectWallet(walletName)}
          style={walletConnected == walletName ? "success" : "primary"}
        >
          Connect {walletName} wallet
        </Button>
      ))}
    </>
  );
}
