import SectionTwoCol from '../../../../common/sectionTwoCol';
import Codeblock from '../../../../ui/codeblock';

export default function SpendingTxInReference() {
  return (
    <SectionTwoCol
      sidebarTo="spendingTxInReference"
      header="Set reference input in transaction"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
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

function Right() {
  return <></>;
}
