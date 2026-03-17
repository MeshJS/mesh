import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function TxbuilderCommonFunctions() {
  return (
    <TwoColumnsScroll
      sidebarTo="commonFunctions"
      title="Common Function(s)"
      leftSection={Left()}
    />
  );
}

function Left() {
  let code1 = `import { BlockfrostProvider, MeshTxBuilder } from "@meshsdk/core";\n\n`;
  code1 += `function getTxBuilder() {\n`;
  code1 += `  const provider = new BlockfrostProvider('<Your-API-Key>');\n`;
  code1 += `  \n`;
  code1 += `  const txBuilder = new MeshTxBuilder({\n`;
  code1 += `    fetcher: provider,\n`;
  code1 += `  });\n`;
  code1 += `  \n`;
  code1 += `  return txBuilder;\n`;
  code1 += `}\n`;

  return (
    <>
      <p>The function(s) that we use in most of these examples.</p>
      <h3>Get tx builder</h3>
      <p>
        This function creates a new instance of the MeshTxBuilder with the
        blockchain provider.
      </p>
      <Codeblock data={code1} />
    </>
  );
}
