import SectionTwoCol from '../../../../common/sectionTwoCol';
import Codeblock from '../../../../ui/codeblock';

export default function MintPlutusScriptV2() {
  return (
    <SectionTwoCol
      sidebarTo="mintPlutusScriptV2"
      header="Use V2 Plutus minting scripts"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
  let code = `mesh.mintPlutusScriptV2()`;

  return (
    <>
      <p>
        Use <code>spendingPlutusScriptV2()</code> to set the instruction that it
        is currently using V2 Plutus minting scripts:
      </p>

      <Codeblock data={code} isJson={false} />
    </>
  );
}

function Right() {
  return <></>;
}
