import Section from '../../../../common/section';
import Codeblock from '../../../../ui/codeblock';

export default function TxOutDatumValue() {
  return (
    <Section
      sidebarTo="txOutDatumValue"
      header="Set output datum"
      contentFn={Content()}
    />
  );
}

function Content() {
  let code = `mesh.txOutDatumValue(datum: Data)`;

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
        Use <code>txOutDatumValue()</code> to set the output datum hash for
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
