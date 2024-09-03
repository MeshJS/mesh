import { MeshTxBuilder } from "@meshsdk/core";

import { getProvider } from "~/components/cardano/mesh-wallet";

export function getTxBuilder() {
  const blockchainProvider = getProvider();
  const txBuilder = new MeshTxBuilder({
    fetcher: blockchainProvider,
    evaluator: blockchainProvider,
    verbose: true,
  });
  txBuilder.setNetwork("preprod");
  return txBuilder;
}

export default function Placeholder() {}

export function Intro() {
  return (
    <>
      <p>
        The <code>MeshTxBuilder</code> is a powerful low-level APIs that allows
        you to build and sign transactions.
      </p>
    </>
  );
}
