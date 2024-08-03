import Link from "next/link";

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
  let codeExampleInline = `// For inline datum`;
  codeExampleInline += `txBuilder\n`;
  codeExampleInline += `  .txOut(address, assets)\n`;
  codeExampleInline += `  .txOutInlineDatumValue(data)\n`;
  let codeExampleHash = `// For datum hash`;
  codeExampleHash += `txBuilder\n`;
  codeExampleHash += `  .txOut(address, assets)\n`;
  codeExampleHash += `  .txOutDatumHashValue(data)\n`;

  return (
    <>
      <p>
        It is possible to attach a "datum" (piece of data) <i>inline</i> to a
        UTxO outputs, which allows us to use the UTxO to hold information which
        we can then use without having to spend it (as with normal UTxOs). You
        can learn more from{" "}
        <a
          href="https://cips.cardano.org/cips/cip32/"
          target="_blank"
          rel="noreferrer"
        >
          CIP-32
        </a>
        .
      </p>
      <p>
        With lower level APIs, you can specify your datum type following the{" "}
        <code>.txOut()</code>:
      </p>
      <Codeblock data={codeExampleInline} />
      <Codeblock data={codeExampleHash} />
    </>
  );
}
