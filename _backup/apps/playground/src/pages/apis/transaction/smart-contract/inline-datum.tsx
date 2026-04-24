import Link from "~/components/link";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function ContractInlineDatum() {
  return (
    <TwoColumnsScroll
      sidebarTo="inlineDatum"
      title="Inline Datum"
      leftSection={Left()}
    />
  );
}

function Left() {
  let codeExample = ``;
  codeExample += `sendAssets(\n`;
  codeExample += `  {\n`;
  codeExample += `    address: someAddress,\n`;
  codeExample += `    datum: {\n`;
  codeExample += `      value: 'supersecret',\n`;
  codeExample += `      inline: true,\n`;
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
        It is possible to attach a "datum" (piece of data) <i>inline</i> to a
        UTxO outputs, which allows us to use the UTxO to hold information which
        we can then use without having to spend it (as with normal UTxOs). You
        can learn more from{" "}
        <Link href="https://cips.cardano.org/cips/cip32/">CIP-32</Link>.
      </p>
      <p>Here's an example of creating a UTxO with inline datum:</p>
      <Codeblock data={codeExample} />
      <p>
        As you can see, you simply have to define the <code>datum</code> field
        in the <code>Recipient</code> input parameter, including a (
        <code>value</code>) and setting <code>inline</code> to <code>true</code>
        . This works for every{" "}
        <Link href="/apis/transaction">transaction endpoints</Link> (e.g.{" "}
        <code>sendLovelace()</code>, <code>sendAssets()</code>,{" "}
        <code>sendValue()</code>).
      </p>
    </>
  );
}
