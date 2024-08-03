import { useAddress } from "@meshsdk/react";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function ReactHookUseAddress() {
  return (
    <TwoColumnsScroll
      sidebarTo="useAddress"
      title="useAddress Hook"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let code1 = `const address = useAddress(accountId = 0);`;

  return (
    <>
      <p>Return address of connected wallet.</p>
      <p>
        <code>accountId</code> is an optional parameter, that allows you to
        choose which address to return.
      </p>
      <Codeblock data={code1} />
    </>
  );
}

function Right() {
  const address = useAddress();

  let code = `import { useAddress } from '@meshsdk/react';\n\n`;
  code += `const address = useAddress();\n`;
  code += `\n`;
  code += `<p>\n`;
  code += `  Your wallet address is: <code>{address}</code>\n`;
  code += `</p>\n`;

  return (
    <LiveCodeDemo
      title="useAddress Hook"
      subtitle="List of wallets installed on user's device"
      code={code}
      childrenAfterCodeFunctions={true}
      runDemoShowBrowseWalletConnect={true}
    >
      <>
        {address !== undefined && (
          <p>
            Your wallet address is: <code>{address}</code>
          </p>
        )}
      </>
    </LiveCodeDemo>
  );
}
