import Section from '../../../../common/section';
import Codeblock from '../../../../ui/codeblock';

export default function MetadataValue() {
  return (
    <Section
      sidebarTo="metadataValue"
      header="Add metadata"
      contentFn={Content()}
    />
  );
}

function Content() {
  let code = `mesh
  .metadataValue(tag: string, metadata: object)`;

  return (
    <>
      <p>
        Use <code>.metadataValue()</code> to add metadata to the transaction:
      </p>

      <Codeblock data={code} isJson={false} />
    </>
  );
}
