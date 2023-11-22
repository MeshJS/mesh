import Section from '../../../../common/section';
import Codeblock from '../../../../ui/codeblock';

export default function ReadOnlyTxInReference() {
  return (
    <Section
      sidebarTo="readOnlyTxInReference"
      header="Set a read-only reference input"
      contentFn={Content()}
    />
  );
}

function Content() {
  let code = `mesh
  .readOnlyTxInReference(txHash: string, txIndex: number)`;

  return (
    <>
      <p>
        Use <code>.readOnlyTxInReference()</code> to specify a read-only
        reference input:
      </p>

      <Codeblock data={code} isJson={false} />
    </>
  );
}
