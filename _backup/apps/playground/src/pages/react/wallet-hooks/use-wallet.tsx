import { CardanoWallet, useWallet } from "@meshsdk/react";

import Button from "~/components/button/button";
import Link from "~/components/link";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { useDarkmode } from "~/hooks/useDarkmode";

export default function ReactHookUseWallet() {
  return (
    <TwoColumnsScroll
      sidebarTo="useWallet"
      title="useWallet Hook"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let code1 = `const { wallet, state, connected, name, connecting, connect, disconnect, error } = useWallet();`;

  return (
    <>
      <p>
        Provide information on the current wallet's state, and functions for
        connecting and disconnecting user wallet.
      </p>
      <Codeblock data={code1} />
      <p>
        <code>wallet</code> is a{" "}
        <Link href="/apis/wallets/browserwallet">Browser Wallet</Link> instance,
        which expose all CIP wallets functions from getting assets to signing
        tranasction.
      </p>
      <p>
        <code>state</code>, a enum string, the state of the wallet, can be{" "}
        <code>NOT_CONNECTED</code>, <code>CONNECTING</code> or{" "}
        <code>CONNECTED</code>.
      </p>
      <p>
        <code>connected</code>, a boolean, <code>true</code> if user's wallet is
        connected.
      </p>
      <p>
        <code>name</code>, a string, the name of the connect wallet.
      </p>
      <p>
        <code>connecting</code>, a boolean, <code>true</code> if the wallet is
        connecting and initializing.
      </p>
      <p>
        <code>connect(walletName: string)</code>, a function, provide the wallet
        name to connect wallet. Retrive a list of available wallets with{" "}
        <code>useWalletList()</code>.
      </p>
      <p>
        <code>disconnect()</code>, a function, to disconnect the connected
        wallet.
      </p>
      <p>
        <code>error</code>, returns the error object if any error occurs during
        wallet connection, such as "account not set".
      </p>
    </>
  );
}

function Right() {
  const isDark = useDarkmode((state) => state.isDark);
  const { connected, name, connecting, disconnect, state } = useWallet();

  let code2 = `import { useWallet } from '@meshsdk/react';\n\n`;
  code2 += `export default function Page() {\n`;
  code2 += `  const { wallet, state, connected, name, connecting, connect, disconnect, error } = useWallet();\n\n`;
  code2 += `  return (\n`;
  code2 += `    <div>\n`;
  code2 += `      <p>\n`;
  code2 += `        <b>State: </b> {state}\n`;
  code2 += `      </p>\n`;
  code2 += `      <p>\n`;
  code2 += `        <b>Connected?: </b> {connected ? 'Is connected' : 'Not connected'}\n`;
  code2 += `      </p>\n`;
  code2 += `      <p>\n`;
  code2 += `        <b>Connecting wallet?: </b> {connecting ? 'Connecting...' : 'No'}\n`;
  code2 += `      </p>\n`;
  code2 += `      <p>\n`;
  code2 += `        <b>Name of connected wallet: </b>\n`;
  code2 += `        {name}\n`;
  code2 += `      </p>\n`;
  code2 += `      <button onClick={() => disconnect()}>Disconnect Wallet</button>\n`;
  code2 += `    </div>\n`;
  code2 += `  );\n`;
  code2 += `}\n`;

  return (
    <LiveCodeDemo
      title="useWallet Hook"
      subtitle="Interact with user's wallet"
      code={code2}
      childrenAfterCodeFunctions={true}
    >
      <CardanoWallet isDark={isDark} />
      <div>
        <p>
          <b>State: </b> {state}
        </p>
        <p>
          <b>Connected?: </b> {connected ? "Is connected" : "Not connected"}
        </p>
        <p>
          <b>Connecting wallet?: </b> {connecting ? "Connecting..." : "No"}
        </p>
        <p>
          <b>Name of connected wallet: </b>
          {name}
        </p>
        <Button onClick={() => disconnect()}>Disconnect Wallet</Button>
      </div>
    </LiveCodeDemo>
  );
}
