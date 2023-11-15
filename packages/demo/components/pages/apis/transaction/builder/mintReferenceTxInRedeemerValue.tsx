import Section from '../../../../common/section';
import Codeblock from '../../../../ui/codeblock';

export default function MintReferenceTxInRedeemerValue() {
  return (
    <Section
      sidebarTo="mintReferenceTxInRedeemerValue"
      header="Set redeemer for reference input in minting"
      contentFn={Content()}
    />
  );
}

function Content() {
  let code = `mesh.mintReferenceTxInRedeemerValue(redeemerData: Data, exUnits: { mem: number, steps: number })`;

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
        Use <code>mintReferenceTxInRedeemerValue()</code> to set the redeemer
        for the reference input of current mint transaction:
      </p>

      <Codeblock data={code} isJson={false} />

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
