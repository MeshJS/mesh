import { MeshTxBuilder } from "@meshsdk/core";

import { getProvider } from "~/components/cardano/mesh-wallet";

export function getTxBuilder() {
  const blockchainProvider = getProvider();
  return new MeshTxBuilder({
    // evaluator: blockchainProvider,
    fetcher: blockchainProvider,
  });
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
