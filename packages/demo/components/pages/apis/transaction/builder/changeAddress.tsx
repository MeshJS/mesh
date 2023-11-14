import SectionTwoCol from '../../../../common/sectionTwoCol';
import Codeblock from '../../../../ui/codeblock';

export default function ChangeAddress() {
  return (
    <SectionTwoCol
      sidebarTo="changeAddress"
      header="Configure address for change UTxO"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
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

function Right() {
  return <></>;
}
