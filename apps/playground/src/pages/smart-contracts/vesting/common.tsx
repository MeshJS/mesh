import { MeshVestingContract } from "@meshsdk/contract";
import { BrowserWallet, MeshTxBuilder } from "@meshsdk/core";

import { getProvider } from "../../../components/cardano/mesh-wallet";

export function getContract(wallet: BrowserWallet) {
  const blockchainProvider = getProvider();

  const meshTxBuilder = new MeshTxBuilder({
    fetcher: blockchainProvider,
    submitter: blockchainProvider,
  });

  const contract = new MeshVestingContract({
    mesh: meshTxBuilder,
    fetcher: blockchainProvider,
    wallet: wallet,
    networkId: 0,
  });

  return contract;
}

export default function Placeholder() {
  return <></>;
}
