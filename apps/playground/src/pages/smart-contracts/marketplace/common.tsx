import { MeshMarketplaceContract } from "@meshsdk/contract";
import { IWallet, MeshTxBuilder } from "@meshsdk/core";

import { getProvider } from "../../../components/cardano/mesh-wallet";
import { demoAddresses, demoAsset } from "../../../data/cardano";

export const asset = demoAsset;
export const price = 10000000;

export function getContract(wallet: IWallet) {
  const blockchainProvider = getProvider();

  const meshTxBuilder = new MeshTxBuilder({
    fetcher: blockchainProvider,
    submitter: blockchainProvider,
  });

  const contract = new MeshMarketplaceContract(
    {
      mesh: meshTxBuilder,
      fetcher: blockchainProvider,
      wallet: wallet,
      networkId: 0,
    },
    demoAddresses.testnet,
    200, // 2% fee
  );

  return contract;
}

export default function Placeholder() {
  return <></>;
}
