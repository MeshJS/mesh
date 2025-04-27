import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export let CodeTxBuilderInit = "";
CodeTxBuilderInit += `import { BlockfrostProvider, MeshTxBuilder } from "@meshsdk/core";\n`;
CodeTxBuilderInit += `\n`;
CodeTxBuilderInit += `const provider = new BlockfrostProvider('<Your-API-Key>');\n\n`;
CodeTxBuilderInit += `const txBuilder = new MeshTxBuilder({\n`;
CodeTxBuilderInit += `  fetcher: provider,\n`;
CodeTxBuilderInit += `  verbose: true,\n`;
CodeTxBuilderInit += `});\n`;

export default function TxbuilderInitializeTxbuilder() {
  return (
    <TwoColumnsScroll
      sidebarTo="initializeTxbuilder"
      title="Initialize Tx Builder"
      leftSection={Left()}
    />
  );
}

function Left() {
  let signature = ``;
  signature += `{\n`;
  signature += `  fetcher?: IFetcher;\n`;
  signature += `  submitter?: ISubmitter;\n`;
  signature += `  evaluator?: IEvaluator;\n`;
  signature += `  serializer?: IMeshTxSerializer;\n`;
  signature += `  isHydra?: boolean;\n`;
  signature += `  params?: Partial<Protocol>;\n`;
  signature += `  verbose?: boolean;\n`;
  signature += `}\n`;

  return (
    <>
      <p>
        To start building an customized transaction, you need to first
        initialize <code>MeshTxBuilder</code>:
      </p>

      <Codeblock data={CodeTxBuilderInit} />

      <p>
        The <code>MeshTxBuilder</code> instance has the following signature:
      </p>
      <Codeblock data={signature} />

      <p>
        There are 6 optional fields to pass in to initialized the lower level
        APIs instance:
      </p>

      <ol>
        <li>
          <code>serializer</code>: The default serializer is{" "}
          <code>CSLSerializer</code>. You can pass in your own serializer
          instance.
        </li>
        <li>
          <code>fetcher</code>: When you build the transaction without
          sufficient fields as required by the serialization library, we would
          index the blockchain to fill the information for you. Affected APIs
          are <code>txIn</code>, <code>txInCollateral</code>,{" "}
          <code>spendingTxInReference</code>.
        </li>
        <li>
          <code>submitter</code>: It is used if you would like to use the{" "}
          <code>submitter</code> <b>submitTx</b> API directly from the instance.
        </li>
        <li>
          <code>evaluator</code>: It would perform redeemer execution unit
          optimization, returning error message in case of invalid transaction.
        </li>
        <li>
          <code>isHydra</code>: Use another set of default protocol parameters
          for building transactions.
        </li>
        <li>
          <code>params</code>: You can pass in the protocol parameters directly.
        </li>
        <li>
          <code>verbose</code>: Set to <code>true</code> to enable verbose
          logging.
        </li>
      </ol>
    </>
  );
}
