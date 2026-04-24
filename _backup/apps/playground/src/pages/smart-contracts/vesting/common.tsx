import { MeshVestingContract } from "@meshsdk/contract";
import { IWallet, MeshTxBuilder } from "@meshsdk/core";

import { getProvider } from "../../../components/cardano/mesh-wallet";

export function getContract(wallet: IWallet) {
  const provider = getProvider();

  const meshTxBuilder = new MeshTxBuilder({
    fetcher: provider,
    submitter: provider,
  });

  const contract = new MeshVestingContract({
    mesh: meshTxBuilder,
    fetcher: provider,
    wallet: wallet,
    networkId: 0,
  });

  return contract;
}

export default function Placeholder() {
  return <></>;
}
