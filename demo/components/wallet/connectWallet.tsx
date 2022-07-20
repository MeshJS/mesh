import { useEffect, useState } from "react";
import Mesh from "@martifylabs/mesh";
import { Button } from "../../components";

const WALLETS = {
  nami: {
    name: "Nami",
    logo: "nami.svg",
  },
  ccvault: {
    name: "Eternl",
    logo: "eternl.webp",
  },
  gerowallet: {
    name: "Gero",
    logo: "gerowallet.svg",
  },
};

export default function ConnectWallet({ walletConnected, setWalletConnected }) {
  const [availableWallets, setAvailableWallets] = useState<string[] | null>(
    null
  );

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
      {availableWallets
        ? availableWallets.length == 0
          ? "No wallets found"
          : availableWallets.map((walletName, i) => (
              <Button
                key={walletName}
                onClick={() => connectWallet(walletName)}
                style={walletConnected == walletName ? "success" : "light"}
              >
                <img
                  src={`/wallets/${WALLETS[walletName].logo}`}
                  className="m-0 mr-2 w-6 h-6"
                />
                Connect with {WALLETS[walletName].name}
              </Button>
            ))
        : ""}
    </>
  );
}
