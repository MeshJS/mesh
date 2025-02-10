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

    try {
      if (hasConnectedWallet) {
        const txHash = await connectedWalletInstance.submitTx(signedTx);
        setResult(txHash);
      }

      throw new Error(
        "Please make sure to connect a wallet before calling useWalletSubmit",
      );
    } catch (error) {
      setError(error);
    }

    setSubmitting(false);
  }, []);

  return {
    error,
    result,
    submitting,
    submitTx,
  };
};
