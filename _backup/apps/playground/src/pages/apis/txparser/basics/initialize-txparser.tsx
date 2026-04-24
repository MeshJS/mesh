import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export let CodeTxParserInit = "";
CodeTxParserInit += `import { BlockfrostProvider, TxParser } from "@meshsdk/core";\n`;
CodeTxParserInit += `import { CSLSerializer } from "@meshsdk/core-csl";\n`;
CodeTxParserInit += `\n`;
CodeTxParserInit += `const fetcher = new BlockfrostProvider('<Your-API-Key>');\n`;
CodeTxParserInit += `const serializer = new CSLSerializer();\n`;
CodeTxParserInit += `const txParser = new TxParser(serializer, fetcher);`;
CodeTxParserInit += `\n`;

export default function TxParserInitializeTxParser() {
  return (
    <TwoColumnsScroll
      sidebarTo="initializeTxParser"
      title="Initialize Tx Parser"
      leftSection={Left()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        To start parsing transaction, you need to first initialize{" "}
        <code>TxParser</code>:
      </p>

      <Codeblock data={CodeTxParserInit} />

      <p>
        There are 2 fields to pass in to initialized <code>TxParser</code>:
      </p>

      <ol>
        <li>
          <code>serializer</code>: The serializer instance that will be used for
          parsing transaction
        </li>
        <li>
          <code>fetcher</code> (optional): <code>TxParser</code> requires all
          input <code>UTxO</code> information provided since the transaction
          CBOR hex only preserves transaction hash and output index. When you
          are not providing all input <code>UTxO</code> information, the{" "}
          <code>fetcher</code> instance is used to fetch the missing{" "}
          <code>UTxO</code>
        </li>
      </ol>
    </>
  );
}
