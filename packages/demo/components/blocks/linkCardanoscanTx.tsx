import { useState, useEffect } from 'react';
import useWallet from '../../contexts/wallet';

export function LinkCardanoscanTx({ txHash }) {
  const [url, setUrl] = useState<string>('');
  const { wallet, walletConnected } = useWallet();

  useEffect(() => {
    async function createLink() {
      let newUrl =
        (await wallet.getNetworkId()) === 1
          ? 'https://cardanoscan.io/transaction/'
          : 'https://testnet.cardanoscan.io/transaction/';

      newUrl += txHash;
      setUrl(newUrl);
    }
    if (walletConnected) {
      createLink();
    }
  }, [walletConnected]);

  return (
    <>
      {txHash && txHash.length && (
        <a href={url} target="_blank" rel="noreferrer">
          Check transaction on CardanoScan explorer
        </a>
      )}
    </>
  );
}
