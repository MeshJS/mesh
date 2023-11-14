import SectionTwoCol from '../../../../common/sectionTwoCol';
import Codeblock from '../../../../ui/codeblock';

export default function TxOutReferenceScript() {
  return (
    <SectionTwoCol
      sidebarTo="txOutReferenceScript"
      header="Set reference script"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
  let code = `mesh.txOutReferenceScript(scriptCbor: string)`;

  return (
    <>
      <p>
        Use <code>txOutReferenceScript()</code> to set the reference script to
        be attached with the output:
      </p>

      <Codeblock data={code} isJson={false} />
    </>
  );
}

function Right() {
  return <></>;
}
