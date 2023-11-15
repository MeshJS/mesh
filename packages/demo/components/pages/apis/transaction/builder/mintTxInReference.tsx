import Section from '../../../../common/section';
import Codeblock from '../../../../ui/codeblock';

export default function MintTxInReference() {
  return (
    <Section
      sidebarTo="mintTxInReference"
      header="Set reference input for minting"
      contentFn={Content()}
    />
  );
}

function Content() {
  let code = `mesh.mintTxInReference(txHash: string, txIndex: number)`;

  return (
    <>
      <p>
        Use <code>mintTxInReference()</code> to set the reference input of
        current mint transaction:
      </p>

      <Codeblock data={code} isJson={false} />
    </>
  );
}
