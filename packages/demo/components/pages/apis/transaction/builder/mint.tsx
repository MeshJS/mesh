import SectionTwoCol from '../../../../common/sectionTwoCol';
import Codeblock from '../../../../ui/codeblock';

export default function Mint() {
  return (
    <SectionTwoCol
      sidebarTo="mint"
      header="Set minting value"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
  let code = `mesh.mint(quantity: number, policy: string, name: string)`;

  return (
    <>
      <p>
        Use <code>mint()</code> to set the minting value of transaction:
      </p>

      <Codeblock data={code} isJson={false} />
    </>
  );
}

function Right() {
  return <></>;
}
