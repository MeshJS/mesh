import { useAssets } from "@meshsdk/react";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function ReactHookUseAssets() {
  return (
    <TwoColumnsScroll
      sidebarTo="useAssets"
      title="useAssets Hook"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let code1 = `const assets = useAssets();`;

  return (
    <>
      <p>Return a list of assets in connected wallet from all UTXOs.</p>
      <Codeblock data={code1} />
    </>
  );
}

function Right() {
  const assets = useAssets();

  let code = `import { useAssets } from '@meshsdk/react';\n\n`;
  code += `const assets = useAssets();\n`;
  code += `\n`;
  code += `{JSON.stringify(assets, null, 2)}`;

  return (
    <LiveCodeDemo
      title="useAssets Hook"
      subtitle="List assets of connected wallet"
      code={code}
      childrenAfterCodeFunctions={true}
      runDemoShowBrowseWalletConnect={true}
    >
      {assets && <Codeblock data={assets} isJson={true} />}
    </LiveCodeDemo>
  );
}
