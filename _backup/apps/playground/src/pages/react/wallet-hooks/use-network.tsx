import { useNetwork } from "@meshsdk/react";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function ReactHookuseNetwork() {
  return (
    <TwoColumnsScroll
      sidebarTo="useNetwork"
      title="useNetwork Hook"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let code1 = `const network = useNetwork();`;

  return (
    <>
      <p>Return the network of connected wallet.</p>
      <Codeblock data={code1} />
    </>
  );
}

function Right() {
  const network = useNetwork();

  let code = `import { useNetwork } from '@meshsdk/react';\n\n`;
  code += `const network = useNetwork();\n`;
  code += `\n`;
  code += `<p>\n`;
  code += `  Connected network: <code>{network}</code>.\n`;
  code += `</p>\n`;

  return (
    <LiveCodeDemo
      title="useNetwork Hook"
      subtitle="Fetch the network of the connected wallet"
      code={code}
      childrenAfterCodeFunctions={true}
      runDemoShowBrowseWalletConnect={true}
    >
      <>
        {network !== undefined && (
          <p>
            Connected network: <code>{network}</code>.
          </p>
        )}
      </>
    </LiveCodeDemo>
  );
}
