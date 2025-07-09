import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function TxParserTestingSignature() {
  return (
    <TwoColumnsScroll
      sidebarTo="testingSignature"
      title="Testing Signature"
      leftSection={Left()}
    />
  );
}

function Left() {
  let code = ``;
  code += `txTester\n`;
  code += `  .keySigned("fa5136e9e9ecbc9071da73eeb6c9a4ff73cbf436105cf8380d1c525c");\n`;
  return (
    <>
      <p>Testing time with below APIs:</p>
      <Codeblock data={code} />
      <ol>
        <li>
          <code>keySigned</code>: Checks if a specific key is signed in the
          transaction.
        </li>
        <li>
          <code>oneOfKeysSigned</code>: Checks if any one of the specified keys
          is signed in the transaction.
        </li>
        <li>
          <code>allKeysSigned</code>: Checks if all specified keys are signed in
          the transaction.
        </li>
      </ol>
    </>
  );
}
