import Section from '../../../../common/section';
import Codeblock from '../../../../ui/codeblock';

export default function ChangeAddress() {
  return (
    <Section
      sidebarTo="changeAddress"
      header="Configure address for change UTxO"
      contentFn={Content()}
    />
  );
}

function Content() {
  let code = `mesh.changeAddress(address: string)`;

  return (
    <>
      <p>
        Use <code>changeAddress()</code> to configure the address to accept
        change UTxO:
      </p>

      <Codeblock data={code} isJson={false} />
    </>
  );
}
