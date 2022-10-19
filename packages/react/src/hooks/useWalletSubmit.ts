import { useCallback, useContext, useState } from 'react';
import { WalletContext } from '@mesh/contexts';

export const useWalletSubmit = () => {
  const [error, setError] = useState<unknown>();
  const [result, setResult] = useState<string>();
  const [submitting, setSubmitting] = useState<boolean>(false);

  const { hasConnectedWallet, connectedWalletInstance } =
    useContext(WalletContext);

  const submitTx = useCallback(async (signedTx: string) => {
    setSubmitting(true);

    try {
      if (hasConnectedWallet) {
        const txHash = await connectedWalletInstance.submitTx(signedTx);
        setError(undefined);
        setResult(txHash);
      }

      throw new Error(
        'Please make sure to connect a wallet before calling useWalletSubmit'
      );
    } catch (error) {
      setError(error);
      console.error(error);
    }

    setSubmitting(false);
  }, []);

  return {
    error, result,
    submitting,
    submitTx,
  };
};
