import Link from "~/components/link";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function TxParserTxTester() {
  return (
    <TwoColumnsScroll
      sidebarTo="txTester"
      title="Unit Testing Transaction"
      leftSection={Left()}
    />
  );
}

function Left() {
  let code = "";
  code += `await txParser.parse(txHex, utxos);\n`;
  code += `const txTester = txParser.toTester();\n`;

  return (
    <>
      <p>
        To unit test a transaction, you can parse the transaction and then
        convert the instance to <code>TxTester</code>:
      </p>

      <Codeblock data={code} />

      <p>
        The detailed testing APIs can be found in the{" "}
        <Link href="./txtester">documentation</Link>.
      </p>
    </>
  );
}
