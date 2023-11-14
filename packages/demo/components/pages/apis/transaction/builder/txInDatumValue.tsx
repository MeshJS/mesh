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
  let code = `mesh.txInDatumValue(datum: Data)`;

  let codeData = ``;
  codeData += `Data = string |\n`;
  codeData += `       number |\n`;
  codeData += `       Array<Data> |\n`;
  codeData += `       Map<Data, Data> |\n`;
  codeData += `       {\n`;
  codeData += `         alternative: number;\n`;
  codeData += `         fields: Array<Data>;\n`;
  codeData += `       }`;

  return (
    <>
      <p>
        Use <code>txInDatumValue()</code> to set the input datum for
        transaction:
      </p>

      <Codeblock data={code} isJson={false} />

      <p>
        Where <code>Data</code> is a string, a number, an array of Data, a map
        of Data, or an object with the following properties:
      </p>

      <Codeblock data={codeData} isJson={false} />
    </>
  );
}

function Right() {
  return <></>;
}
