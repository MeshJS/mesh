import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function TxParserTestingOutputs() {
  return (
    <TwoColumnsScroll
      sidebarTo="testingOutputs"
      title="Testing Outputs"
      leftSection={Left()}
    />
  );
}

function Left() {
  let code = ``;
  code += `txTester\n`;
  code += `  .outputsAt(\n`;
  code += `    "addr_test1qrs3jlcsapdufgagzt35ug3nncwl26mlkcux49gs673sflmrjfm6y2eu7del3pprckzt4jaal9s7w9gq5kguqs5pf6fq542mmq",\n`;
  code += `  )\n`;
  code += `  .outputsValue(\n`;
  code += `    MeshValue.fromAssets([{ unit: "lovelace", quantity: "10000000000" }]),\n`;
  code += `  )\n`;
  code += `  .outputsInlineDatumExist(datumCbor);`;
  return (
    <>
      <p>
        Testing outputs starts with locating the outputs you want to test. The
        filtering will not reset until the filtering methods are called again.
      </p>
      <Codeblock data={code} />

      <p>There are multiple methods available to filter the outputs:</p>

      <ol>
        <li>
          <code>allOutputs</code>: not apply filters
        </li>
        <li>
          <code>outputsAt</code>: filtering outputs with address
        </li>
        <li>
          <code>outputsWith</code>: filtering outputs with token
        </li>
        <li>
          <code>outputsWithPolicy</code>: filtering outputs with policy id
        </li>
        <li>
          <code>outputsAtWith</code>: filtering outputs with address and token
        </li>
        <li>
          <code>outputsAtWithPolicy</code>: filtering outputs with address and
          policy id
        </li>
      </ol>

      <p>After applying filters, you can proceed with checking value:</p>
      <ol>
        <li>
          <code>outputsValue</code>: Check the total value of the filtered
          outputs
        </li>
        <li>
          <code>outputsInlineDatumExist</code>: Check whether any one of the
          outputs contains inline datum (provided as CBOR)
        </li>
      </ol>
    </>
  );
}
