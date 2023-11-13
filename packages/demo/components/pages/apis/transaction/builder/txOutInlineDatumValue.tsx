import SectionTwoCol from '../../../../common/sectionTwoCol';
import Codeblock from '../../../../ui/codeblock';

export default function TxOutInlineDatumValue() {
  return (
    <SectionTwoCol
      sidebarTo="txOutInlineDatumValue"
      header="Set output inline datum"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
  let code1 = `mesh.txOutInlineDatumValue(datum: Data)`;

  return (
    <>
      <p>
        Use <code>txOutInlineDatumValue()</code> to set the output inline datum
        for transaction:
      </p>

      <Codeblock data={code1} isJson={false} />
    </>
  );
}

function Right() {
  return <></>;
}
