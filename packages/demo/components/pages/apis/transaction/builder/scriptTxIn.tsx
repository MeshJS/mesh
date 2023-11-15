import Section from '../../../../common/section';
import Codeblock from '../../../../ui/codeblock';

export default function ScriptTxIn() {
  return (
    <Section
      sidebarTo="scriptTxIn"
      header="Set script input for transaction"
      contentFn={Content()}
    />
  );
}

function Content() {
  let code = `mesh
  .spendingPlutusScriptV2()
  .txIn(txHash: string, txIndex: number, amount?: Asset[], address?: string)
  .txInInlineDatumPresent()
  .txInRedeemerValue(redeemer: Redeemer, exUnits?: Budget)
  .simpleScriptTxInReference(txHash: string, txIndex: number, spendingScriptHash?: string)
`;

  return (
    <>
      <h3>When spending a script input, there are 3 steps</h3>
      <h4>1. Notifying the instance currently we would spend a script input</h4>
      <h4>
        2. Providing input information by <code>.txIn()</code>
      </h4>
      <h4>3. Providing spending information for</h4>
      <div className="pl-4">
        <h4>(a) the script source by</h4>
        <p className="pl-4">
          (i) Reference script
          <code>
            .simpleScriptTxInReference(txHash: string, txIndex: number,
            spendingScriptHash?: string)
          </code>
          <br />
          (ii) Supplying script (not supported yet)
        </p>
      </div>
      <div className="pl-4">
        <h4>(b) the redeemer source by</h4>
        <p className="pl-4">
          <code>txInRedeemerValue = ( redeemer: Data, exUnits?: Budget)</code>
        </p>
      </div>
      <div className="pl-4">
        <h4>(c) the datum source by</h4>
        <p className="pl-4">
          (i) Referencing inline datum
          <code>.txInInlineDatumPresent()</code>
          <br />
          (ii) Supplying datum <code>.txInDatumValue(datum: Data)</code>
        </p>
      </div>

      <h3>A complete example below:</h3>
      <Codeblock data={code} isJson={false} />
    </>
  );
}
