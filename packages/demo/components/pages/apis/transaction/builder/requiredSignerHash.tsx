import SectionTwoCol from '../../../../common/sectionTwoCol';
import Codeblock from '../../../../ui/codeblock';

export default function RequiredSignerHash() {
  return (
    <SectionTwoCol
      sidebarTo="requiredSignerHash"
      header="Set required signer"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
  let code1 = `mesh.requiredSignerHash(pubKeyHash: string)`;

  return (
    <>
      <p>
        Use <code>requiredSignerHash()</code> to set the required signer of the
        transaction:
      </p>

      <Codeblock data={code1} isJson={false} />
    </>
  );
}

function Right() {
  return <></>;
}
