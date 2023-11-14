import SectionTwoCol from '../../../../common/sectionTwoCol';
import Codeblock from '../../../../ui/codeblock';

export default function MintingScript() {
  return (
    <SectionTwoCol
      sidebarTo="mintingScript"
      header="Set minting script"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
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

function Right() {
  return <></>;
}
