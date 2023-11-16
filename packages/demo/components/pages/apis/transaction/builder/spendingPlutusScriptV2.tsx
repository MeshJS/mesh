import Section from '../../../../common/section';
import Codeblock from '../../../../ui/codeblock';

export default function SpendingPlutusScriptV2() {
  return (
    <Section
      sidebarTo="spendingPlutusScriptV2"
      header="Use V2 Plutus spending scripts"
      contentFn={Content()}
    />
  );
}

function Content() {
  let code = `mesh.spendingPlutusScriptV2()`;

  return (
    <>
      <p>
        Use <code>spendingPlutusScriptV2()</code> to set the instruction that it
        is currently using V2 Plutus spending scripts:
      </p>

      <Codeblock data={code} isJson={false} />
      <p>
        This flag should signal a start to a script input. The next step after
        will be to add a tx-in. After which, we will REQUIRE, script, datum and
        redeemer info for unlocking this particular input
      </p>
    </>
  );
}
