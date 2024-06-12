import Section from '../../../../common/section';
import Codeblock from '../../../../ui/codeblock';

export default function Mint() {
  return (
    <Section
      sidebarTo="mintNative"
      header="Mint 'native script' token"
      contentFn={Content()}
    />
  );
}

function Content() {
  let code = `mesh
  .mint(quantity: string, policy: string, name: string)
  .mintingScript(scriptCbor: string)
`;

  return (
    <>
      <h3>
        When minting tokens using a 'native script' as input, there are 2 steps:
      </h3>
      <h4>
        1. Providing the minting value (quantity, policy and name) using{' '}
        <code>.mint()</code>
      </h4>
      <h4>
        2. Providing the script source using
        <code>.mintingScript()</code>
      </h4>
      {/* <div className="pl-4">
        <p className="pl-4">
          (i) Reference script
          <code>.mintTxInReference()</code>
          <br />
          (ii) Supplying script
          <code>.mintingScript()</code>
        </p>
      </div> */}
      <Codeblock data={code} isJson={false} />
    </>
  );
}
