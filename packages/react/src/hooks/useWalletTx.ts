import { useContext, useState } from 'react';
import { Transaction } from '@martifylabs/mesh';
import { WalletContext } from '@mesh/contexts';
import type { Era, Protocol } from '@martifylabs/mesh';

export const useWalletTx = (options: {
  era?: Era, parameters?: Protocol,
}) => {
  const { era, parameters } = options;

  const {
    hasConnectedWallet,
    connectedWalletInstance,
  } = useContext(WalletContext);

  const [tx] = useState<Transaction>(() => {
    if (hasConnectedWallet) {
      return new Transaction({
        initiator: connectedWalletInstance,
        parameters,
        era,
      });
    }

    throw new Error('Please make sure to connect a wallet before calling useWalletTx');
  });

  return tx;
};
