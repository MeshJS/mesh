import SectionTwoCol from '../../../../common/sectionTwoCol';
import Codeblock from '../../../../ui/codeblock';

export default function SpendingReferenceTxInRedeemerValue() {
  return (
    <SectionTwoCol
      sidebarTo="spendingReferenceTxInRedeemerValue"
      header="Set redeemer for reference input"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
  let code1 = `mesh.spendingReferenceTxInRedeemerValue(redeemer: Data, exUnits: { mem: number, steps: number })`;

  return (
    <>
      <p>
        Use <code>spendingReferenceTxInRedeemerValue()</code> to set the
        redeemer for the reference input to be spent in same transaction:
      </p>

      <Codeblock data={code1} isJson={false} />
      <p>
        This reference input is not witnessing anything it is simply provided in
        the plutus script context.
      </p>
    </>
  );
}

function Right() {
  return <></>;
}
