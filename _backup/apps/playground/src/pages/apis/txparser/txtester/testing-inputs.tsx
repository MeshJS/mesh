import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function TxParserTestingInputs() {
  return (
    <TwoColumnsScroll
      sidebarTo="testingInputs"
      title="Testing Inputs"
      leftSection={Left()}
    />
  );
}

function Left() {
  let code = ``;
  code += `txTester\n`;
  code += `  .inputsAt(\n`;
  code += `    "addr_test1qrs3jlcsapdufgagzt35ug3nncwl26mlkcux49gs673sflmrjfm6y2eu7del3pprckzt4jaal9s7w9gq5kguqs5pf6fq542mmq",\n`;
  code += `  )\n`;
  code += `  .inputsValue(\n`;
  code += `    MeshValue.fromAssets([{ unit: "lovelace", quantity: "10000000000" }]),\n`;
  code += `  )\n`;
  return (
    <>
      <p>
        Testing inputs starts with locating the inputs you want to test. The
        filtering will not reset until the filtering methods are called again.
      </p>
      <Codeblock data={code} />
      <p>There are multiple methods available to filter the inputs:</p>

      <ol>
        <li>
          <code>allInputs</code>: not apply filters
        </li>
        <li>
          <code>inputsAt</code>: filtering inputs with address
        </li>
        <li>
          <code>inputsWith</code>: filtering inputs with token
        </li>
        <li>
          <code>inputsWithPolicy</code>: filtering inputs with policy id
        </li>
        <li>
          <code>inputsAtWith</code>: filtering inputs with address and token
        </li>
        <li>
          <code>inputsAtWithPolicy</code>: filtering inputs with address and
          policy id
        </li>
      </ol>

      <p>After applying filters, you can proceed with checking value:</p>
      <ol>
        <li>
          <code>inputsValue</code>: Check the total value of the filtered inputs
        </li>
      </ol>
    </>
  );
}
