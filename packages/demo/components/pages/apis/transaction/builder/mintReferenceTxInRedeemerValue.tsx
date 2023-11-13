import SectionTwoCol from '../../../../common/sectionTwoCol';
import Codeblock from '../../../../ui/codeblock';

export default function MintReferenceTxInRedeemerValue() {
  return (
    <SectionTwoCol
      sidebarTo="mintReferenceTxInRedeemerValue"
      header="Set redeemer for reference input in minting"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
  let code1 = `mesh.mintReferenceTxInRedeemerValue(redeemerData: Data, exUnits: { mem: number, steps: number })`;

  return (
    <>
      <p>
        Use <code>mintReferenceTxInRedeemerValue()</code> to set the redeemer
        for the reference input of current mint transaction:
      </p>

      <Codeblock data={code1} isJson={false} />
    </>
  );
}

function Right() {
  return <></>;
}
