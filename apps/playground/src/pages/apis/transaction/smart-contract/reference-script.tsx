import Link from "~/components/link";

import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function ContractReferenceScript() {
  return (
    <TwoColumnsScroll
      sidebarTo="referenceScript"
      title="Reference Script"
      leftSection={Left()}
    />
  );
}

function Left() {
  let codeExample = ``;
  codeExample += `sendAssets(\n`;
  codeExample += `  {\n`;
  codeExample += `    address: someAddress,\n`;
  codeExample += `    script: {\n`;
  codeExample += `      version: 'V2',\n`;
  codeExample += `      code: '...',\n`;
  codeExample += `    },\n`;
  codeExample += `  },\n`;
  codeExample += `  [\n`;
  codeExample += `    {\n`;
  codeExample += `      unit: "64af286e2ad0df4de2e7de15f8ff5b3d27faecf4ab2757056d860a424d657368546f6b656e",\n`;
  codeExample += `      quantity: "1",\n`;
  codeExample += `    },\n`;
  codeExample += `  ],\n`;
  codeExample += `)\n`;

  return (
    <>
      <p>
        Validation requires access to any scripts that are involved, but adding
        entire scripts to transactions increases the transaction size and can
        lead to bloating of the blockchain. A useful solution is to instead
        store script references in a UTxO, which allows us to later use that
        UTxO to build future transactions without having to include the entire
        script. Thus we can reduce the size of the transaction, which may allow
        us to send (for example) multiple scripts within one transaction without
        exceeding the maximum transaction size.
      </p>
      <Codeblock data={codeExample} />
      <p>
        Simply define the <code>script</code> as the <code>Recipient</code>{" "}
        input parameter. This works for every{" "}
        <Link href="/apis/transaction">transaction endpoints</Link> (e.g..{" "}
        <code>sendLovelace()</code>, <code>sendAssets()</code>,{" "}
        <code>sendValue()</code>).
      </p>
    </>
  );
}
