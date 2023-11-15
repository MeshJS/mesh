import Section from '../../../../common/section';
import Codeblock from '../../../../ui/codeblock';

export default function MintingScript() {
  return (
    <Section
      sidebarTo="mintingScript"
      header="Set minting script"
      contentFn={Content()}
    />
  );
}

function Content() {
  let code = `mesh.mintingScript(scriptCBOR: string)`;

  return (
    <>
      <p>
        Use <code>mintingScript()</code> to set the minting script of current
        mint transaction:
      </p>

      <Codeblock data={code} isJson={false} />
    </>
  );
}
