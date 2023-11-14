import SectionTwoCol from '../../../../common/sectionTwoCol';
import Codeblock from '../../../../ui/codeblock';

export default function MintTxInReference() {
  return (
    <SectionTwoCol
      sidebarTo="mintTxInReference"
      header="Set reference input for minting"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
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

function Right() {
  return <></>;
}
