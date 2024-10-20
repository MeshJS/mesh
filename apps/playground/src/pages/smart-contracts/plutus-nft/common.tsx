import { create } from "zustand";
import { persist } from "zustand/middleware";

import { MeshPlutusNFTContract } from "@meshsdk/contract";
import { BrowserWallet, MeshTxBuilder, UTxO } from "@meshsdk/core";

import { getProvider } from "../../../components/cardano/mesh-wallet";
import InputTable from "~/components/sections/input-table";
import Input from "~/components/form/input";

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

interface State {
  paramUtxo: string;
  setParamUtxo: (paramUtxo: string) => void;
}

export const usePlutusNft = create<State>()(
  persist(
    (set) => ({
      paramUtxo: JSON.stringify({
        outputIndex: 0,
        txHash:
          "8190f693414b4922c4cc46f8e4bb2d8d6cd80cca4992a68bd53a332b0d991abf",
      }),
      setParamUtxo: (paramUtxo: string) =>
        set(() => ({
          paramUtxo: paramUtxo,
        })),
    }),
    {
      name: "mesh-plutusnft",
    },
  ),
);

export function InputsParamUtxo() {
  const paramUtxo = usePlutusNft((state) => state.paramUtxo);
  const setParamUtxo = usePlutusNft((state) => state.setParamUtxo);
  return (
    <InputTable
      listInputs={[
        <Input
          value={paramUtxo}
          onChange={(e) => setParamUtxo(e.target.value)}
          placeholder="{outputIndex: 0, txHash: 'txhash...txhash'}"
          label="Param UTxO"
          key={0}
        />,
      ]}
    />
  );
}

export default function Placeholder() {
  return <></>;
}
