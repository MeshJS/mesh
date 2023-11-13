import SectionTwoCol from '../../../../common/sectionTwoCol';
import Codeblock from '../../../../ui/codeblock';

export default function CompleteSigning() {
  return (
    <SectionTwoCol
      sidebarTo="completeSigning"
      header="Complete signing"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
  let code1 = `mesh.completeSigning()`;

  return (
    <>
      <p>
        Use <code>completeSigning()</code> to complete the signing process:
      </p>

      <Codeblock data={code1} isJson={false} />
    </>
  );
}

function Right() {
  return <></>;
}
