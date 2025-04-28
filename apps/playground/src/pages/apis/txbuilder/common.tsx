import { MeshTxBuilder } from "@meshsdk/core";
import { CardanoSDKSerializer } from "@meshsdk/core-cst";

import { getProvider } from "~/components/cardano/mesh-wallet";
import Link from "~/components/link";
import Codeblock from "~/components/text/codeblock";

export function getTxBuilder() {
  const provider = getProvider();
  const txBuilder = new MeshTxBuilder({
    fetcher: provider,
    submitter: provider,
    evaluator: provider,
    serializer: new CardanoSDKSerializer(),
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
      <Codeblock data={txbuilderCode} />
    </>
  );
}

export let txbuilderCode = ``;
txbuilderCode += `const txBuilder = new MeshTxBuilder({\n`;
txbuilderCode += `  fetcher: provider, // get a provider https://meshjs.dev/providers\n`;
txbuilderCode += `  verbose: true,\n`;
txbuilderCode += `});\n\n`;
