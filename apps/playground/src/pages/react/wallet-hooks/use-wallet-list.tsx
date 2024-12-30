import { useWalletList } from "@meshsdk/react";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function ReactHookUseWalletList() {
  return (
    <TwoColumnsScroll
      sidebarTo="useWalletList"
      title="useWalletList Hook"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>Returns a list of wallets installed on user's device.</p>
      <Codeblock data={`const wallets = useWalletList();`} />
      <p>
        You can define a function to be injected into the wallet provider by
        passing it as the
        <code>injectFn</code> prop.
      </p>
      <Codeblock
        data={`const wallets = useWalletList({injectFn={async () => await checkIfMetamaskInstalled("preprod")})}`}
      />
    </>
  );
}

function Right() {
  const wallets = useWalletList();

  let code3 = `import { useWalletList } from '@meshsdk/react';\n\n`;
  code3 += `export default function Page() {\n`;
  code3 += `  const wallets = useWalletList();\n\n`;
  code3 += `  return (\n`;
  code3 += `    <>\n`;
  code3 += `      {wallets.map((wallet, i) => {\n`;
  code3 += `        return (\n`;
  code3 += `          <p key={i}>\n`;
  code3 += `            <img src={wallet.icon} style={{ width: '48px' }} />\n`;
  code3 += `            <b>{wallet.name}</b>\n`;
  code3 += `          </p>\n`;
  code3 += `        );\n`;
  code3 += `      })}\n`;
  code3 += `    </>\n`;
  code3 += `  );\n`;
  code3 += `}\n`;

  return (
    <LiveCodeDemo
      title="useWalletList Hook"
      subtitle="List of wallets installed on user's device"
      code={`const wallets = useWalletList();`}
      childrenAfterCodeFunctions={true}
    >
      <>
        <Codeblock data={wallets} isJson={true} />

        <Codeblock data={code3} />

        {wallets.map((wallet, i) => {
          return (
            <p key={i}>
              <img src={wallet.icon} style={{ width: "48px" }} />
              <b>{wallet.name}</b>
            </p>
          );
        })}
      </>
    </LiveCodeDemo>
  );
}
