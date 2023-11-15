import Section from '../../../../common/section';
import SectionTwoCol from '../../../../common/sectionTwoCol';
import Codeblock from '../../../../ui/codeblock';

export default function TxInInlineDatumPresent() {
  return (
    <Section
      sidebarTo="txInInlineDatumPresent"
      header="Specify input UTxO has inlined datum"
      contentFn={Content()}
    />
  );
}

function Content() {
  let code = `mesh.txInInlineDatumPresent()`;

  return (
    <>
      <p>
        Use <code>txInInlineDatumPresent()</code> to tell the transaction
        builder that the input UTxO has inlined datum:
      </p>

      <Codeblock data={code} isJson={false} />
    </>
  );
}
