import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function TxParserTestingInputs() {
  return (
    <TwoColumnsScroll
      sidebarTo="interpretResult"
      title="Interpret Result"
      leftSection={Left()}
    />
  );
}

function Left() {
  let code = ``;
  code += `const result = txTester.success();\n`;
  code += `console.log("Errors:", txTester.errors());\n`;

  return (
    <>
      <p>
        After performing the tests, you can interpret the results of the tests
        using the <code>success</code> and <code>errors</code> methods.
      </p>

      <Codeblock data={code} />

      <ol>
        <li>
          <code>success</code>: Return a boolean indicating if all tests are
          passed
        </li>
        <li>
          <code>errors</code>: Show all the errors that occurred during the
          tests . If there are no errors, it will return an empty string.
        </li>
      </ol>
    </>
  );
}
