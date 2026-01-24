import { useCallback, useContext, useState } from "react";

import { WalletContext } from "../contexts";

export const useWalletSubmit = () => {
  const [error, setError] = useState<unknown>();
  const [result, setResult] = useState<string>();
  const [submitting, setSubmitting] = useState<boolean>(false);

  const { hasConnectedWallet, connectedWalletInstance } =
    useContext(WalletContext);

  const submitTx = useCallback(async (signedTx: string) => {
    setSubmitting(true);
    setError(undefined);
    setResult(undefined);

    try {
      if (!hasConnectedWallet) {
        throw new Error(
          "Please make sure to connect a wallet before calling useWalletSubmit",
        );
      }

      const txHash = await connectedWalletInstance.submitTx(signedTx);
      setResult(txHash);
    } catch (error) {
      setError(error);
    } finally {
      setSubmitting(false);
    }
  }, [hasConnectedWallet, connectedWalletInstance]);

  return {
    error,
    result,
    submitting,
    submitTx,
  };
};
