import { useEffect, useState } from 'react';
import { BrowserWallet } from '@martifylabs/mesh';
import type { Wallet } from '@martifylabs/mesh';
import useWallet from '../contexts/wallet';

export default function ConnectWallet() {
  const [availableWallets, setAvailableWallets] = useState<
    Wallet[] | undefined
  >(undefined);
  const { walletNameConnected, connecting, connectWallet, walletConnected } =
    useWallet();

  useEffect(() => {
    async function init() {
      setAvailableWallets(BrowserWallet.getInstalledWallets());
    }
    init();
  }, []);

  return (
    <>
      {availableWallets
        ? availableWallets.length == 0
          ? 'No wallets found'
          : availableWallets.map((wallet, i) => (
              <button
                key={i}
                onClick={() => connectWallet(wallet.name)}
                disabled={
                  walletConnected ||
                  connecting ||
                  walletNameConnected == wallet.name
                }
                style={{
                  fontWeight:
                    walletNameConnected == wallet.name ? 'bold' : 'normal',
                  margin: '8px',
                  backgroundColor:
                    walletNameConnected == wallet.name
                      ? 'green'
                      : connecting
                      ? 'orange'
                      : 'grey',
                }}
              >
                <img
                  src={wallet.icon}
                  style={{
                    width: '40px',
                    height: '40px',
                  }}
                />
                Connect with {wallet.name}
              </button>
            ))
        : ''}
    </>
  );
}
