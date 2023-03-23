import Link from 'next/link';
import SectionTwoCol from '../../../../common/sectionTwoCol';
import Codeblock from '../../../../ui/codeblock';

export default function ReferenceScript() {
  return (
    <SectionTwoCol
      sidebarTo="referenceScript"
      header="Reference Script"
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
        Adding entire script(s) in the transaction, this increases the
        transaction size. Therefore, we can store script reference in a UTxO,
        doing so allows us to use UTxO to build future transactions without
        having to include the entire script. Doing so reduces the size of the
        transaction, which allows you to spend from multiple scripts within one
        transaction without exceeding the maximum transaction size.
      </p>
      <Codeblock data={codeExample} isJson={false} />
      <p>
        Simply define the <code>script</code> into the <code>Recipient</code>{' '}
        input parameter. This works for every{' '}
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
