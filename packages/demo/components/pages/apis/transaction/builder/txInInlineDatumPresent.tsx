import SectionTwoCol from '../../../../common/sectionTwoCol';
import Codeblock from '../../../../ui/codeblock';

export default function TxInInlineDatumPresent() {
  return (
    <SectionTwoCol
      sidebarTo="txInInlineDatumPresent"
      header="Specify input UTxO has inlined datum"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
  let code1 = `mesh.txInInlineDatumPresent()`;

  return (
    <>
      <p>
        Use <code>txInInlineDatumPresent()</code> to tell the transaction
        builder that the input UTxO has inlined datum:
      </p>

      <Codeblock data={code1} isJson={false} />
    </>
  );
}

function Right() {
  return <></>;
}
