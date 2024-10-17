import { MeshPlutusNFTContract } from "@meshsdk/contract";
import { BrowserWallet, MeshTxBuilder, UTxO } from "@meshsdk/core";

import { getProvider } from "../../../components/cardano/mesh-wallet";

export function getContract(
  wallet: BrowserWallet,
  collectionName: string,
  paramUtxo?: UTxO["input"],
) {
  const blockchainProvider = getProvider();

  const meshTxBuilder = new MeshTxBuilder({
    fetcher: blockchainProvider,
    submitter: blockchainProvider,
    verbose: true,
  });

  const contract = new MeshPlutusNFTContract(
    {
      mesh: meshTxBuilder,
      fetcher: blockchainProvider,
      wallet: wallet,
      networkId: 0,
    },
    {
      collectionName: collectionName,
      paramUtxo: paramUtxo,
    },
  );

  return contract;
}

export default function Placeholder() {
  return <></>;
}
