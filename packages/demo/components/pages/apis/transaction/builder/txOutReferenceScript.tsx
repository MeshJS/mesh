import Section from '../../../../common/section';
import Codeblock from '../../../../ui/codeblock';

export default function TxOutReferenceScript() {
  return (
    <Section
      sidebarTo="txOutReferenceScript"
      header="Set reference script"
      contentFn={Content()}
    />
  );
}

function Content() {
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
