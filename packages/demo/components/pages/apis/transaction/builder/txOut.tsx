import SectionTwoCol from '../../../../common/sectionTwoCol';
import Codeblock from '../../../../ui/codeblock';

export default function TxOut() {
  return (
    <SectionTwoCol
      sidebarTo="txOut"
      header="Set output for transaction"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
  let code1 = `mesh.txOut(address: string, amount: Asset[])`;

  return (
    <>
      <p>
        Use <code>txOut()</code> to set the input datum for transaction:
      </p>

      <Codeblock data={code1} isJson={false} />
    </>
  );
}

function Right() {
  return <></>;
}
