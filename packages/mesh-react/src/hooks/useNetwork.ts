import { useContext, useEffect, useState } from "react";

import { WalletContext } from "../contexts";

export const useNetwork = () => {
  const [networkId, setNetworkId] = useState<number>();
  const { hasConnectedWallet, connectedWalletInstance } =
    useContext(WalletContext);

  useEffect(() => {
    if (hasConnectedWallet) {
      connectedWalletInstance.getNetworkId().then(setNetworkId);
    } else {
      setNetworkId(undefined);
    }
  }, [hasConnectedWallet, connectedWalletInstance]);

  return networkId;
};
