import Section from '../../../../common/section';
import Codeblock from '../../../../ui/codeblock';

export default function Mint() {
  return (
    <Section
      sidebarTo="mintPlutus"
      header="Mint 'Plutus script' token"
      contentFn={Content()}
    />
  );
}

function Content() {
  let code = `mesh
  .mintPlutusScriptV2()
  .mint(quantity: number, policy: string, name: string)
  .mintTxInReference(txHash: string, txIndex: number) // or .mintingScript(scriptCbor: string)
  .mintRedeemerValue(redeemer: Data | object | string, exUnits?: Budget, type?: "Mesh" | "CBOR" | "JSON")
`;

  return (
    <>
      <h3>
        When minting tokens with a Plutus script as input, there are 3 steps:
      </h3>
      <h4>
        1. Notifying the current instance that we are minting using a Plutus
        Script
      </h4>
      <h4>
        2. Providing minting value (quantity, policy, name) with{' '}
        <code>.mint()</code>
      </h4>
      <h4>3. Providing minting information, which consists of:</h4>
      <div className="pl-4">
        <h4>(a) the script source, supplied by either</h4>
        <p className="pl-4">
          (i) providing a Reference script with
          <code>.mintTxInReference()</code> or
          <br />
          (ii) Supplying script source (cbor string) directly with
          <code>.mintingScript()</code>
        </p>
      </div>
      <div className="pl-4">
        <h4>(b) the redeemer source with</h4>
        <h4>
          `Note that the data provided can be the in type of "Mesh", "CBOR" or
          "JSON" (the JSON representation of PlutusData in DetailedSchema)`
        </h4>
        <p className="pl-4">
          <code>.mintRedeemerValue()</code>
        </p>
      </div>
      <h3>Example of minting a token using a Plutus script:</h3>
      <Codeblock data={code} isJson={false} />
    </>
  );
}
