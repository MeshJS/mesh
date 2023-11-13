import SectionTwoCol from '../../../../common/sectionTwoCol';
import Codeblock from '../../../../ui/codeblock';

export default function TxInDatumValue() {
  return (
    <SectionTwoCol
      sidebarTo="txInDatumValue"
      header="Set input datum"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
  let code1 = `mesh.txInDatumValue(datum: Data)`;

  return (
    <>
      <p>
        Use <code>txInDatumValue()</code> to set the input datum for
        transaction:
      </p>

      <Codeblock data={code1} isJson={false} />
    </>
  );
}

function Right() {
  return <></>;
}
