import { create } from "zustand";
import { persist } from "zustand/middleware";

import { MeshContentOwnershipContract } from "@meshsdk/contract";
import { IWallet, MeshTxBuilder, UTxO } from "@meshsdk/core";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import { demoAddresses } from "~/data/cardano";
import { getProvider } from "../../../components/cardano/mesh-wallet";

export function getContract(
  wallet: IWallet,
  operationAddress: string,
  paramUtxo?: UTxO["input"],
  refScriptUtxos?: {
    contentRegistry: UTxO["input"];
    contentRefToken: UTxO["input"];
    ownershipRegistry: UTxO["input"];
    ownershipRefToken: UTxO["input"];
  },
) {
  const provider = getProvider();

  const meshTxBuilder = new MeshTxBuilder({
    fetcher: provider,
    submitter: provider,
    verbose: true,
  });

  const contract = new MeshContentOwnershipContract(
    {
      mesh: meshTxBuilder,
      fetcher: provider,
      wallet: wallet,
      networkId: 0,
    },
    {
      operationAddress: operationAddress,
      paramUtxo: paramUtxo,
      refScriptUtxos: refScriptUtxos,
    },
  );

  return contract;
}

export const sampleParamUtxo = {
  outputIndex: 0,
  txHash: "2aba4d6705cfe6405cf02e4e2c8b71965d2b86b828e3f6ffbf3f8bded3df2359",
};

interface State {
  operationAddress: string;
  setOperationAddress: (address: string) => void;
  paramUtxo: string;
  setParamUtxo: (paramUtxo: string) => void;

  contentRegistry: string;
  setContentRegistry: (address: string) => void;
  contentRefToken: string;
  setContentRefToken: (address: string) => void;
  ownershipRegistry: string;
  setOwnershipRegistry: (address: string) => void;
  ownershipRefToken: string;
  setOwnershipRefToken: (address: string) => void;
}

export const useContentOwnership = create<State>()(
  persist(
    (set) => ({
      operationAddress: demoAddresses.testnet,
      setOperationAddress: (address: string) => {
        set(() => ({
          operationAddress: address,
        }));
      },
      paramUtxo: JSON.stringify(sampleParamUtxo),
      setParamUtxo: (paramUtxo: string) =>
        set(() => ({
          paramUtxo: paramUtxo,
        })),
      contentRegistry:
        "dfd2a2616e6154a092807b1ceebb9ddcadc0f22cf5c8e0e6b0757815083ccb70",
      setContentRegistry: (address: string) =>
        set(() => ({
          contentRegistry: address,
        })),
      contentRefToken:
        "8f731be135171df172c07578a5d74589ec8fb30b37c12fdbe2639d69b7587f5e",
      setContentRefToken: (address: string) =>
        set(() => ({
          contentRefToken: address,
        })),
      ownershipRegistry:
        "ec874b61eec4e5e8e395dead6c9bb18690e6d6ea64d773760c5e654ec9ff5f97",
      setOwnershipRegistry: (address: string) =>
        set(() => ({
          ownershipRegistry: address,
        })),
      ownershipRefToken:
        "e1bdfc7ae6929f934cf9d418273dde143cbb65ec0eec23bdb6c342e4cd91dbd0",
      setOwnershipRefToken: (address: string) =>
        set(() => ({
          ownershipRefToken: address,
        })),
    }),
    {
      name: "mesh-contentownership",
    },
  ),
);

export function InputsOperationAddress() {
  const operationAddress = useContentOwnership(
    (state) => state.operationAddress,
  );
  const setOperationAddress = useContentOwnership(
    (state) => state.setOperationAddress,
  );
  return (
    <InputTable
      listInputs={[
        <Input
          value={operationAddress}
          onChange={(e) => setOperationAddress(e.target.value)}
          placeholder="addr1..."
          label="Operation address"
          key={0}
        />,
      ]}
    />
  );
}

export function InputsParamUtxo() {
  const paramUtxo = useContentOwnership((state) => state.paramUtxo);
  const setParamUtxo = useContentOwnership((state) => state.setParamUtxo);
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

export function InputsRefScriptUtxos() {
  const contentRegistry = useContentOwnership((state) => state.contentRegistry);
  const setContentRegistry = useContentOwnership(
    (state) => state.setContentRegistry,
  );
  const contentRefToken = useContentOwnership((state) => state.contentRefToken);
  const setContentRefToken = useContentOwnership(
    (state) => state.setContentRefToken,
  );
  const ownershipRegistry = useContentOwnership(
    (state) => state.ownershipRegistry,
  );
  const setOwnershipRegistry = useContentOwnership(
    (state) => state.setOwnershipRegistry,
  );
  const ownershipRefToken = useContentOwnership(
    (state) => state.ownershipRefToken,
  );
  const setOwnershipRefToken = useContentOwnership(
    (state) => state.setOwnershipRefToken,
  );
  return (
    <InputTable
      listInputs={[
        <Input
          value={contentRegistry}
          onChange={(e) => setContentRegistry(e.target.value)}
          placeholder="txhash...txhash"
          label="Content Registry Tx Hash"
          key={0}
        />,
        <Input
          value={contentRefToken}
          onChange={(e) => setContentRefToken(e.target.value)}
          placeholder="txhash...txhash"
          label="Content Ref Token Tx Hash"
          key={1}
        />,
        <Input
          value={ownershipRegistry}
          onChange={(e) => setOwnershipRegistry(e.target.value)}
          placeholder="txhash...txhash"
          label="Ownership Registry Tx Hash"
          key={2}
        />,
        <Input
          value={ownershipRefToken}
          onChange={(e) => setOwnershipRefToken(e.target.value)}
          placeholder="txhash...txhash"
          label="Ownership Ref Token Tx Hash"
          key={3}
        />,
      ]}
    />
  );
}

export default function Placeholder() {
  return <></>;
}
