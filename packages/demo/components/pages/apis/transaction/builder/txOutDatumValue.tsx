import SectionTwoCol from '../../../../common/sectionTwoCol';
import Codeblock from '../../../../ui/codeblock';

export default function TxOutDatumValue() {
  return (
    <SectionTwoCol
      sidebarTo="txOutDatumValue"
      header="Set output datum"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
  let code1 = `mesh.txOutDatumValue(datum: Data)`;

  return (
    <>
      <p>
        Use <code>txOutDatumValue()</code> to set the output datum hash for
        transaction:
      </p>

      <Codeblock data={code1} isJson={false} />
    </>
  );
}

function Right() {
  return <></>;
}
