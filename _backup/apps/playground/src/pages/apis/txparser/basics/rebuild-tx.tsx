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

export default function TxParserRebuildTx() {
  return (
    <TwoColumnsScroll
      sidebarTo="rebuildTx"
      title="Rebuild Transaction"
      leftSection={Left()}
    />
  );
}

function Left() {
  let code = `const txBuilderBody = await txParser.parse(txHex, utxos);\n`;

  return (
    <>
      <p>To parse a transaction, you only need:</p>

      <Codeblock data={code} />
      <p>
        With the parsed <code>txBuilderBody</code> in type{" "}
        <code>MeshTxBuilderBody</code>, you can proceed with adding / removing
        elements and rebuilding the transaction.
      </p>
      <p>There are 2 necessary fields to pass in:</p>
      <ol>
        <li>
          <code>txHex</code>: The transaction CBOR to be parsed
        </li>
        <li>
          <code>providedUtxos</code>: The input information, for all inputs,
          reference inputs, and collateral. You can either construct it manually
          or obtain it from <code>fetcher</code>.
        </li>
      </ol>
    </>
  );
}
