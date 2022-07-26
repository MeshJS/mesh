import { useEffect, useState } from 'react';
import Mesh from '@martifylabs/mesh';

const useWallet = () => {
  const [walletConnected, setWalletConnected] = useState<null | string>(null);
  const [availableWallets, setAvailableWallets] = useState<string[] | null>(
    null
  );
  const [connecting, setConnecting] = useState<boolean>(false);

  async function connectWallet(walletName: string) {
    setConnecting(true);
    let connected = await Mesh.wallet.enable({ walletName: walletName });
    if (connected) {
      setWalletConnected(walletName);
    }
    setConnecting(false);
  }

  useEffect(() => {
    async function init() {
      setAvailableWallets(await Mesh.wallet.getAvailableWallets());
    }
    init();
  }, []);
  
  return {
    connecting,
    walletConnected,
    availableWallets,
    connectWallet,
  };
};

export default useWallet;
