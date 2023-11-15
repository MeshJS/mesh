import Section from '../../../../common/section';
import Codeblock from '../../../../ui/codeblock';

export default function RequiredSignerHash() {
  return (
    <Section
      sidebarTo="requiredSignerHash"
      header="Set required signer"
      contentFn={Content()}
    />
  );
}

function Content() {
  let code = `mesh.requiredSignerHash(pubKeyHash: string)`;

  return (
    <>
      <p>
        Use <code>requiredSignerHash()</code> to set the required signer of the
        transaction:
      </p>

      <Codeblock data={code} isJson={false} />
    </>
  );
}
