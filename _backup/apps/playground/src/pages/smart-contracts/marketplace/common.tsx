import { MeshMarketplaceContract } from "@meshsdk/contract";
import { IWallet, MeshTxBuilder } from "@meshsdk/core";

import { getProvider } from "../../../components/cardano/mesh-wallet";
import { demoAddresses, demoAsset } from "../../../data/cardano";

export const asset = demoAsset;
export const price = 10000000;

export function getContract(wallet: IWallet) {
  const provider = getProvider();

  const meshTxBuilder = new MeshTxBuilder({
    fetcher: provider,
    submitter: provider,
  });

  const contract = new MeshMarketplaceContract(
    {
      mesh: meshTxBuilder,
      fetcher: provider,
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
