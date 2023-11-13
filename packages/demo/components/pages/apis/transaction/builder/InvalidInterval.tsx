import SectionTwoCol from '../../../../common/sectionTwoCol';
import Codeblock from '../../../../ui/codeblock';

export default function InvalidInterval() {
  return (
    <SectionTwoCol
      sidebarTo="invalidInterval"
      header="Set the transaction valid interval"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
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

function Right() {
  return <></>;
}
