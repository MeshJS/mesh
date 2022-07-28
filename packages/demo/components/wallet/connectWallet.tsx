import { useEffect, useState } from 'react';
import Mesh from '@martifylabs/mesh';
import { Button } from '../../components';
import useWallet from '../../contexts/wallet';

const WALLETS = {
  nami: {
    name: 'Nami',
    logo: 'nami.svg',
  },
  ccvault: {
    name: 'Eternl',
    logo: 'eternl.webp',
  },
  gerowallet: {
    name: 'Gero',
    logo: 'gerowallet.svg',
  },
};

export default function ConnectWallet() {
  const { connecting, walletNameConnected, connectWallet } = useWallet();
  const [availableWallets, setAvailableWallets] = useState<string[] | null>(
    null
  );
  // const [connecting, setConnecting] = useState<boolean>(false);
  // const [walletNameConnected, setWalletNameConnected] = useState<string>('');

  // async function connectWallet(walletName: string) {
  //   setConnecting(true);
  //   const walletConnected = await Mesh.wallet.enable({
  //     walletName: walletName,
  //   });
  //   if (walletConnected) {
  //     if (setWalletConnected) {
  //       setWalletConnected(true);
  //     }
  //     setWalletNameConnected(walletName);
  //   }
  //   setConnecting(false);
  // }

  useEffect(() => {
    async function init() {
      setAvailableWallets(await Mesh.wallet.getAvailableWallets());
    }
    init();
  }, []);

  return (
    <>
      {availableWallets
        ? availableWallets.length == 0
          ? 'No wallets found'
          : availableWallets.map((walletName, i) => (
              <Button
                key={i}
                onClick={() => connectWallet(walletName)}
                style={walletNameConnected == walletName ? 'success' : 'light'}
                disabled={connecting || walletNameConnected == walletName}
              >
                <img
                  src={`/wallets/${WALLETS[walletName].logo}`}
                  className="m-0 mr-2 w-6 h-6"
                />
                Connect with {WALLETS[walletName].name}
              </Button>
            ))
        : ''}
    </>
  );
}
