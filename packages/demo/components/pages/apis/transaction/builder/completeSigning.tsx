import Section from '../../../../common/section';
import Codeblock from '../../../../ui/codeblock';

export default function CompleteSigning() {
  return (
    <Section
      sidebarTo="completeSigning"
      header="Complete signing"
      contentFn={Content()}
    />
  );
}

function Content() {
  let code = `mesh.completeSigning()`;

  return (
    <>
      <p>
        Use <code>completeSigning()</code> to complete the signing process:
      </p>

      <Codeblock data={code} isJson={false} />
    </>
  );
}
