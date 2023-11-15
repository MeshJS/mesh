import Section from '../../../../common/section';
import Codeblock from '../../../../ui/codeblock';

export default function TxOut() {
  return (
    <Section
      sidebarTo="txOut"
      header="Set output for transaction"
      contentFn={Content()}
    />
  );
}

function Content() {
  let code = `mesh
  .txOut(address: string, amount: Asset[])`;
  let codeWithScript = `mesh
  .txOut(address: string, amount: Asset[])
  .txOutReferenceScript(scriptCbor: string)`;

  let codeWithDatum = `mesh
  .txOut(address: string, amount: Asset[])
  .txOutDatumHashValue(datum: Data) // or .txOutInlineDatumValue(datum: Data)
`;

  return (
    <>
      <p>
        Use <code>txOut()</code> to set the input datum for transaction:
      </p>

      <Codeblock data={code} isJson={false} />
      <h3>Attaching datum in output</h3>
      <p>
        You could attach datum with the output by
        <code>.txOutDatumHashValue()</code> or{' '}
        <code>.txOutInlineDatumValue()</code>
      </p>
      <Codeblock data={codeWithDatum} isJson={false} />
      <h3>Attaching script in output for referencing</h3>
      <p>
        You could attach script the output by
        <code>.txOutReferenceScript()</code>
      </p>
      <Codeblock data={codeWithScript} isJson={false} />
    </>
  );
}
