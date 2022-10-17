import { useContext, useState } from 'react';
import { WalletContext } from '@mesh/react/contexts';
import { Transaction } from '@mesh/transaction';
import type { Era, Protocol } from '@mesh/common/types';

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
        era, parameters,
      });
    }

    throw new Error('Please make sure to connect a wallet before calling useWalletTx');
  });

  return tx;
};
