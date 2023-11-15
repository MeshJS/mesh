import Section from '../../../../common/section';
import Codeblock from '../../../../ui/codeblock';

export default function TxOutInlineDatumValue() {
  return (
    <Section
      sidebarTo="txOutInlineDatumValue"
      header="Set output inline datum"
      contentFn={Content()}
    />
  );
}

function Content() {
  let code = `mesh.txOutInlineDatumValue(datum: Data)`;

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
        Use <code>txOutInlineDatumValue()</code> to set the output inline datum
        for transaction:
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
