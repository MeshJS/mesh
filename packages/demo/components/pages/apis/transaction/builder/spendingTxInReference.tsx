import Section from '../../../../common/section';
import Codeblock from '../../../../ui/codeblock';

export default function SpendingTxInReference() {
  return (
    <Section
      sidebarTo="spendingTxInReference"
      header="Set reference input in transaction"
      contentFn={Content()}
    />
  );
}

function Content() {
  let code = `mesh.spendingTxInReference(txHash: string, txIndex: number, spendingScriptHash?: string)`;

  return (
    <>
      <p>
        Use <code>spendingTxInReference()</code> to set the reference input
        where it would also be spent in the transaction:
      </p>

      <Codeblock data={code} isJson={false} />
    </>
  );
}
