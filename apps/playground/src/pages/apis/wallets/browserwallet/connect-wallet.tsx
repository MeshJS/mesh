import { useWallet } from "@meshsdk/react";

import ConnectBrowserWallet from "~/components/cardano/connect-browser-wallet";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function BrowserWalletConnectWallet() {
  return (
    <TwoColumnsScroll
      sidebarTo="connectWallet"
      title="Connect Wallet"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        This is the entrypoint to start communication with the user&apos;s
        wallet. The wallet should request the user&apos;s permission to connect
        the web page to the user&apos;s wallet, and if permission has been
        granted, the wallet will be returned and exposing the full API for the
        dApp to use.
      </p>
      <p>
        Query <code>BrowserWallet.getInstalledWallets()</code> to get a list of
        available wallets, then provide the wallet <code>name</code> for which
        wallet the user would like to connect with.
      </p>
    </>
  );
}

function Right() {
  const { name } = useWallet();

  let codeSnippet = "";
  codeSnippet += `import { BrowserWallet } from '@meshsdk/core';\n\n`;
  codeSnippet += `const wallet = await BrowserWallet.enable('${
    name ? name : "eternl"
  }');`;

  return (
    <LiveCodeDemo
      title="Connect Wallet"
      subtitle="Connect to a CIP30 compatible wallet"
      code={codeSnippet}
      childrenAfterCodeFunctions={true}
    >
      <ConnectBrowserWallet />
    </LiveCodeDemo>
  );
}
