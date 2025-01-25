import { MeshTxBuilder } from "@meshsdk/core";

import { getProvider } from "~/components/cardano/mesh-wallet";
import Link from "~/components/link";

export function getTxBuilder() {
  const blockchainProvider = getProvider();
  const txBuilder = new MeshTxBuilder({
    fetcher: blockchainProvider,
    submitter: blockchainProvider,
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
        In the code snippet, you will find <code>txBuilder</code>, which is an
        instance of <code>MeshTxBuilder</code>, a powerful low-level APIs that
        allows you to build transactions. Learn how to initialize{" "}
        <Link href="/apis/txbuilder/basics#initializeTxbuilder">
          MeshTxBuilder
        </Link>
        .
      </p>
    </>
  );
}

export let txbuilderCode = ``;
txbuilderCode += `const txBuilder = new MeshTxBuilder({\n`;
txbuilderCode += `  fetcher: blockchainProvider, // get a provider https://meshjs.dev/providers\n`;
txbuilderCode += `  verbose: true,\n`;
txbuilderCode += `});\n\n`;
