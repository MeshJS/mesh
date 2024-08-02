import {
  BrowserWallet,
  keepRelevant,
  MeshTxBuilder,
  Quantity,
  Unit,
} from "@meshsdk/core";

import { getProvider } from "~/components/cardano/mesh-wallet";

export function getTxBuilder() {
  const blockchainProvider = getProvider();
  return new MeshTxBuilder({
    fetcher: blockchainProvider,
  });
}

export default function Placeholder() {}
