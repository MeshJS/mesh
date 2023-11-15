import Section from '../../../../common/section';
import Codeblock from '../../../../ui/codeblock';

export default function Mint() {
  return (
    <Section
      sidebarTo="mint"
      header="Set minting value"
      contentFn={Content()}
    />
  );
}

function Content() {
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
