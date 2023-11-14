import SectionTwoCol from '../../../../common/sectionTwoCol';
import Codeblock from '../../../../ui/codeblock';

export default function ReadOnlyTxInReference() {
  return (
    <SectionTwoCol
      sidebarTo="readOnlyTxInReference"
      header="Specify read only reference input"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
  let code = `mesh.readOnlyTxInReference(txHash: string, txIndex: number)`;

  return (
    <>
      <p>
        Use <code>readOnlyTxInReference()</code> to specify a read only
        reference input:
      </p>

      <Codeblock data={code} isJson={false} />
    </>
  );
}

function Right() {
  return <></>;
}
