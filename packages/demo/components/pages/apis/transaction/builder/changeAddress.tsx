import Section from '../../../../common/section';
import Codeblock from '../../../../ui/codeblock';

export default function ChangeAddress() {
  return (
    <Section
      sidebarTo="changeAddress"
      header="Set change address"
      contentFn={Content()}
    />
  );
}

function Content() {
  let code = `mesh
  .changeAddress(address: string)`;

  return (
    <>
      <p>
        Use <code>changeAddress()</code> to set the change address:
      </p>

      <Codeblock data={code} isJson={false} />
    </>
  );
}
