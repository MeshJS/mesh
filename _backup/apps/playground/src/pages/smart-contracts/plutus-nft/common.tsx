import { create } from "zustand";
import { persist } from "zustand/middleware";

import { MeshPlutusNFTContract } from "@meshsdk/contract";
import { IWallet, MeshTxBuilder, UTxO } from "@meshsdk/core";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import { getProvider } from "../../../components/cardano/mesh-wallet";

export function getContract(
  wallet: IWallet,
  collectionName: string,
  paramUtxo?: UTxO["input"],
) {
  const provider = getProvider();

  const meshTxBuilder = new MeshTxBuilder({
    fetcher: provider,
    submitter: provider,
    verbose: true,
  });

  const contract = new MeshPlutusNFTContract(
    {
      mesh: meshTxBuilder,
      fetcher: provider,
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

export const demoParamUtxo = {
  outputIndex: 0,
  txHash: "63dbd563ee9979574401599a42841e0d5b63a691af95df863cbf37d5cb44a558",
};

interface State {
  paramUtxo: string;
  setParamUtxo: (paramUtxo: string) => void;
  collectionName: string;
  setCollectionName: (collectionName: string) => void;
}

export const usePlutusNft = create<State>()(
  persist(
    (set) => ({
      paramUtxo: JSON.stringify(demoParamUtxo),
      setParamUtxo: (paramUtxo: string) =>
        set(() => ({
          paramUtxo: paramUtxo,
        })),
      collectionName: "mesh",
      setCollectionName: (collectionName: string) =>
        set(() => ({
          collectionName: collectionName,
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
  const collectionName = usePlutusNft((state) => state.collectionName);
  const setCollectionName = usePlutusNft((state) => state.setCollectionName);

  return (
    <InputTable
      listInputs={[
        <Input
          value={collectionName}
          onChange={(e) => setCollectionName(e.target.value)}
          placeholder="e.g. mesh"
          label="Collection Name"
          key={0}
        />,
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

export function getContractCodeSnippet() {
  return;
}

export default function Placeholder() {
  return <></>;
}
