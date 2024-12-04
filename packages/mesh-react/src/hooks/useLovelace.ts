import { useContext, useEffect, useMemo, useRef, useState } from "react";

import { WalletContext } from "../contexts";

export const useLovelace = () => {
  const [lovelace, setLovelace] = useState<string>();
  const { hasConnectedWallet, connectedWalletInstance } =
    useContext(WalletContext);
  const hasFetchedLovelace = useRef(false);

  useEffect(() => {
    async function getLovelace() {
      if (hasConnectedWallet && !hasFetchedLovelace.current) {
        setLovelace(await connectedWalletInstance.getLovelace());
        hasFetchedLovelace.current = true;
      }
    }
    getLovelace();
  }, [hasConnectedWallet, connectedWalletInstance]);

  const _lovelace = useMemo(() => {
    return lovelace;
  }, [lovelace]);

  return _lovelace;
};
