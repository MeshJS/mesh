import { MeshContentOwnershipContract } from "@meshsdk/contract";
import { BrowserWallet, MeshTxBuilder, UTxO } from "@meshsdk/core";

import { demoAddresses } from "~/data/cardano";
import { getProvider } from "../../../components/cardano/mesh-wallet";

export function getContract(wallet: BrowserWallet, paramUtxo?: UTxO["input"]) {
  const blockchainProvider = getProvider();

  const meshTxBuilder = new MeshTxBuilder({
    fetcher: blockchainProvider,
    submitter: blockchainProvider,
    verbose: true,
  });

  const contract = new MeshContentOwnershipContract(
    {
      mesh: meshTxBuilder,
      fetcher: blockchainProvider,
      wallet: wallet,
      networkId: 0,
    },
    {
      refScriptsAddress: demoAddresses.testnet,
      operationAddress: demoAddresses.testnet,
      // paramUtxo: paramUtxo,
      paramUtxo: {
        outputIndex: 0,
        txHash:
          "e781a02ed4159b47b144e960c4b155918f50b4841eafc443c66fec40616b6df2",
      },
    },
  );

  return contract;
}

export default function Placeholder() {
  return <></>;
}
