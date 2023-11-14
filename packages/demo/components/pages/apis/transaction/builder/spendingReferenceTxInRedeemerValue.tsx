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
  let code = `mesh.spendingReferenceTxInRedeemerValue(redeemer: Data, exUnits: Budget)`;

  let codeData = ``;
  codeData += `Data = string |\n`;
  codeData += `       number |\n`;
  codeData += `       Array<Data> |\n`;
  codeData += `       Map<Data, Data> |\n`;
  codeData += `       {\n`;
  codeData += `         alternative: number;\n`;
  codeData += `         fields: Array<Data>;\n`;
  codeData += `       }`;

  let codeBudget = ``;
  codeBudget += `Budget = {\n`;
  codeBudget += `  mem: number;\n`;
  codeBudget += `  steps: number;\n`;
  codeBudget += `}`;

  return (
    <>
      <p>
        Use <code>spendingReferenceTxInRedeemerValue()</code> to set the
        redeemer for the reference input to be spent in same transaction.
      </p>

      <Codeblock data={code} isJson={false} />

      <p>
        This reference input is not witnessing anything it is simply provided in
        the plutus script context.
      </p>

      <p>
        Where <code>Data</code> is a string, a number, an array of Data, a map
        of Data, or an object with the following properties:
      </p>

      <Codeblock data={codeData} isJson={false} />

      <p>
        Where <code>Budget</code> is an object with the following properties:
      </p>

      <Codeblock data={codeBudget} isJson={false} />
    </>
  );
}

function Right() {
  return <></>;
}
