import Section from '../../../../common/section';
import Codeblock from '../../../../ui/codeblock';

export default function Mint() {
  return (
    <Section
      sidebarTo="mintPlutus"
      header="Mint Plutus script token"
      contentFn={Content()}
    />
  );
}

function Content() {
  let code = `mesh
  .mintPlutusScriptV2()
  .mint(quantity: number, policy: string, name: string)
  .mintTxInReference(txHash: string, txIndex: number) // or .mintingScript(scriptCbor: string)
  .mintRedeemerValue(redeemer: Redeemer, exUnits?: Budget)
`;

  return (
    <>
      <h3>When minting a Plutus token input, there are 3 steps</h3>
      <h4>
        1. Notifying the instance currently we would minting a Plutus token
      </h4>
      <h4>
        2. Providing minting value by <code>.mint()</code>
      </h4>
      <h4>3. Providing minting information for</h4>
      <div className="pl-4">
        <h4>(a) the script source by</h4>
        <p className="pl-4">
          (i) Reference script
          <code>.mintTxInReference()</code>
          <br />
          (ii) Supplying script
          <code>.mintingScript()</code>
        </p>
      </div>
      <div className="pl-4">
        <h4>(b) the redeemer source by</h4>
        <p className="pl-4">
          <code>.mintRedeemerValue()</code>
        </p>
      </div>
      <h3>A complete example below:</h3>
      <Codeblock data={code} isJson={false} />
    </>
  );
}
