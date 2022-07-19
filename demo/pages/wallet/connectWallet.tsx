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
      <h2 className="text-2xl dark:text-white">Connect available wallets</h2>

      {availableWallets.map((walletName, i) => (
        <Button
          key={walletName}
          onClick={() => connectWallet(walletName)}
          style={walletConnected == walletName ? "success" : "light"}
        >
          <img
            src={`/wallets/${WALLETS[walletName].logo}`}
            className="mr-2 -ml-1 w-6 h-5"
          />
          Connect with {WALLETS[walletName].name}
        </Button>
        // <button
        //   key={walletName}
        //   type="button"
        //   className="text-gray-900 bg-white hover:bg-gray-100 border border-gray-200 focus:ring-4 focus:outline-none focus:ring-gray-100 font-medium rounded-lg text-sm px-5 py-2.5 text-center inline-flex items-center dark:focus:ring-gray-600 dark:bg-gray-800 dark:border-gray-700 dark:text-white dark:hover:bg-gray-700 mr-2 mb-2"
        //   onClick={() => connectWallet(walletName)}
        // >
        //   <img
        //     src={`/wallets/${WALLETS[walletName].logo}`}
        //     className="mr-2 -ml-1 w-6 h-5"
        //   />
        //   Connect with {WALLETS[walletName].name}
        // </button>
      ))}
    </>
  );
}
