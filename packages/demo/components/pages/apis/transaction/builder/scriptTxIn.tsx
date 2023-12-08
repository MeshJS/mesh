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
  .txInInlineDatumPresent() // or .txInDatumValue(datum: Data)
  .txInRedeemerValue(redeemer: Redeemer, exUnits?: Budget)
  .spendingTxInReference(txHash: string, txIndex: number, spendingScriptHash?: string) // or supplying script
`;

  return (
    <>
      <h3>There are 3 steps to utilise a script as part of the input for a transaction:</h3>
      <h4>1. Notifying the current instance that we intend to spend a script input</h4>
      <h4>
        2. Providing input information using <code>.txIn()</code>
      </h4>
      <h4>3. Providing the necessary supplementary "spending" script information, which consists of:</h4>
      <div className="pl-4">
        <h4>(a) the script using one of</h4>
        <p className="pl-4">
          (i) Reference script
          <code>.spendingTxInReference()</code>
          <br />
          (ii) Supplying script
          <code>.txInScript(scriptCbor: string)</code>
        </p>
      </div>
      <div className="pl-4">
        <h4>(b) the redeemer using</h4>
        <p className="pl-4">
          <code>.txInRedeemerValue()</code>
        </p>
      </div>
      <div className="pl-4">
        <h4>(c) the datum using one of</h4>
        <p className="pl-4">
          (i) Referencing inline datum
          <code>.txInInlineDatumPresent()</code>
          <br />
          (ii) Supplying datum <code>.txInDatumValue(datum: Data)</code>
        </p>
      </div>

      <h3>Example of utilising a script for input:</h3>
      <Codeblock data={code} isJson={false} />
    </>
  );
}
