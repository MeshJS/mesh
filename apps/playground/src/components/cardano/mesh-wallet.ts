import { BlockfrostProvider, MeshWallet } from "@meshsdk/core";

export function getProvider(network = "preprod") {
  return new BlockfrostProvider(`/api/blockfrost/${network}/`);
}

export function getMeshWallet() {
  const blockchainProvider = getProvider();

  const wallet = new MeshWallet({
    networkId: 0,
    fetcher: blockchainProvider,
    submitter: blockchainProvider,
    key: {
      type: "mnemonic",
      words: "solution,".repeat(24).split(",").slice(0, 24),
    },
  });
  return wallet;
}
