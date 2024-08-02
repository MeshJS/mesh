import { useContext, useEffect, useState } from "react";

import type { Asset } from "@meshsdk/common";

import { WalletContext } from "../contexts";

export const useAssets = () => {
  const [assets, setAssets] = useState<Asset[]>();
  const { hasConnectedWallet, connectedWalletName, connectedWalletInstance } =
    useContext(WalletContext);

  useEffect(() => {
    if (hasConnectedWallet) {
      connectedWalletInstance.getAssets().then(setAssets);
    }
  }, [connectedWalletName]);

  return assets;
};
