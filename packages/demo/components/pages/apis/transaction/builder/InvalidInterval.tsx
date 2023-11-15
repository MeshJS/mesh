import Section from '../../../../common/section';
import Codeblock from '../../../../ui/codeblock';

export default function InvalidInterval() {
  return (
    <Section
      sidebarTo="invalidInterval"
      header="Set the transaction valid interval"
      contentFn={Content()}
    />
  );
}

function Content() {
  let codeBefore = `mesh.invalidBefore(slot: number)`;
  let codeAfter = `mesh.changeAddress(slot: number)`;

  return (
    <>
      <p>
        Use <code>invalidBefore()</code> to set the transaction valid interval
        to be valid only after the slot:
      </p>

      <Codeblock data={codeBefore} isJson={false} />

      <p>
        Use <code>invalidHereafter()</code> to set the transaction valid
        interval to be valid only before the slot:
      </p>

      <Codeblock data={codeAfter} isJson={false} />
    </>
  );
}
