import SectionTwoCol from '../../../../common/sectionTwoCol';
import Codeblock from '../../../../ui/codeblock';

export default function MetadataValue() {
  return (
    <SectionTwoCol
      sidebarTo="metadataValue"
      header="Add metadata"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
  let code1 = `mesh.metadataValue(tag: string, metadata: object)`;

  return (
    <>
      <p>
        Use <code>metadataValue()</code> to add metadata to the transaction:
      </p>

      <Codeblock data={code1} isJson={false} />
    </>
  );
}

function Right() {
  return <></>;
}
