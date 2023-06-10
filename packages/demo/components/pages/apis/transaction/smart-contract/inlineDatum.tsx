import Link from 'next/link';
import SectionTwoCol from '../../../../common/sectionTwoCol';
import Codeblock from '../../../../ui/codeblock';

export default function InlineDatum() {
  return (
    <SectionTwoCol
      sidebarTo="inlineDatum"
      header="Inline Datum"
      leftFn={Left({})}
      rightFn={Right({})}
    />
  );
}

function Left({}) {
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
        Datums can be attached to UTxO outputs, doing so allow us to use UTxO to
        hold extra data. This will allow much simpler communication of datum
        values between users, without spending transaction provides the actual
        datum. You can learn more from{' '}
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
        An example to create a UTxO with inline datum you can do the following:
      </p>
      <Codeblock data={codeExample} isJson={false} />
      <p>
        You simply have to define the <code>datum</code> field in the{' '}
        <code>Recipient</code> input parameter, with the data to specify (
        <code>value</code>) and set <code>inline</code> to <code>true</code>.
        This works for every{' '}
        <Link href="/apis/transaction">transaction endpoints</Link> (i.e.{' '}
        <code>sendLovelace()</code>, <code>sendAssets()</code>,{' '}
        <code>sendValue()</code>).
      </p>
    </>
  );
}

function Right({}) {
  return <></>;
}
