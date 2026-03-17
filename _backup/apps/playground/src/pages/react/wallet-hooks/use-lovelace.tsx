import { useLovelace } from "@meshsdk/react";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function ReactHookUseLovelace() {
  return (
    <TwoColumnsScroll
      sidebarTo="useLovelace"
      title="useLovelace Hook"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let code1 = `const lovelace = useLovelace();`;

  return (
    <>
      <p>Return amount of lovelace in wallet.</p>
      <Codeblock data={code1} />
    </>
  );
}

function Right() {
  const lovelace = useLovelace();

  let code = `import { useLovelace } from '@meshsdk/react';\n\n`;
  code += `const lovelace = useLovelace();\n`;
  code += `\n`;
  code += `<p>\n`;
  code += `  Your lovelace balance is: <code>{lovelace}</code>\n`;
  code += `</p>\n`;

  return (
    <LiveCodeDemo
      title="useLovelace Hook"
      subtitle="Fetch the lovelace balance of the connected wallet"
      code={code}
      childrenAfterCodeFunctions={true}
      runDemoShowBrowseWalletConnect={true}
    >
      <>
        {lovelace !== undefined && (
          <p>
            Your lovelace balance is: <code>{lovelace}</code>
          </p>
        )}
      </>
    </LiveCodeDemo>
  );
}
