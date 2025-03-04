import { BlockfrostProvider, MeshWallet } from "@meshsdk/core";

export function getProvider(network = "preprod") {
  const provider = new BlockfrostProvider(
    `/api/blockfrost/${network}/`,
  );
  provider.setSubmitTxToBytes(false);
  return provider;
}

export function getMeshWallet() {
  const provider = getProvider();
  const wallet = new MeshWallet({
    networkId: 0,
    fetcher: provider,
    submitter: provider,
    key: {
      type: "mnemonic",
      words: "solution,".repeat(24).split(",").slice(0, 24),
    },
  });
  return wallet;
}
