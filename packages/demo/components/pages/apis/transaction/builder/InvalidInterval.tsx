import Section from '../../../../common/section';
import Codeblock from '../../../../ui/codeblock';

export default function InvalidInterval() {
  return (
    <Section
      sidebarTo="invalidInterval"
      header="Set the transaction validity interval"
      contentFn={Content()}
    />
  );
}

function Content() {
  let codeBefore = `mesh
  .invalidBefore(slot: number)`;
  let codeAfter = `mesh
  .invalidHereafter(slot: number)`;

  return (
    <>
      <p>
        Use <code>.invalidBefore()</code> to set the transaction validity interval
        to be valid only after the specified slot:
      </p>

      <Codeblock data={codeBefore} isJson={false} />

      <p>
        Use <code>.invalidHereafter()</code> to set the transaction validity
        interval to be valid only before the specified slot:
      </p>

      <Codeblock data={codeAfter} isJson={false} />
    </>
  );
}
