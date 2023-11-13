import SectionTwoCol from '../../../../common/sectionTwoCol';
import Codeblock from '../../../../ui/codeblock';

export default function TxIn() {
  return (
    <SectionTwoCol
      sidebarTo="txIn"
      header="Set input for transaction"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
  let code1 = `mesh.txIn(txHash: string, txIndex: number, amount?: Asset[], address?: string)`;

  return (
    <>
      <p>
        Use <code>txIn()</code> to set the input for transaction:
      </p>

      <Codeblock data={code1} isJson={false} />
    </>
  );
}

function Right() {
  return <></>;
}
