import { useContext, useEffect, useMemo, useRef, useState } from "react";

import { WalletContext } from "../contexts";

export const useLovelace = () => {
  const [lovelace, setLovelace] = useState<string>();
  const { hasConnectedWallet, connectedWalletName, connectedWalletInstance } =
    useContext(WalletContext);
  const hasFetchedLovelace = useRef(false);

  useEffect(() => {
    async function getLovelace() {
      console.log(333, lovelace, hasConnectedWallet, connectedWalletName);
      setLovelace(await connectedWalletInstance.getLovelace());
    }
    if (hasConnectedWallet && !hasFetchedLovelace.current) {
      getLovelace();
      hasFetchedLovelace.current = true;
    }
  }, [hasConnectedWallet, connectedWalletInstance]);

  const _lovelace = useMemo(() => {
    return lovelace;
  }, [lovelace]);

  return _lovelace;
};
