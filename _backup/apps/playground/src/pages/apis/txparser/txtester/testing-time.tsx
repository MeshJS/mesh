import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function TxParserTestingTime() {
  return (
    <TwoColumnsScroll
      sidebarTo="testingTime"
      title="Testing Time"
      leftSection={Left()}
    />
  );
}

function Left() {
  let code = ``;
  code += `txTester\n`;
  code += `  .validBefore(beforeTimestamp)\n`;
  code += `  .validAfter(afterTimestamp);\n`;
  return (
    <>
      <p>Testing time with below APIs:</p>
      <Codeblock data={code} />
      <ol>
        <li>
          <code>validAfter</code>: Checks if the transaction is valid after a
          specified timestamp.
        </li>
        <li>
          <code>validBefore</code>: Checks if the transaction is valid before a
          specified timestamp.
        </li>
      </ol>
    </>
  );
}
