import Link from "~/components/link";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function SvelteState() {
  return (
    <TwoColumnsScroll
      sidebarTo="svelteState"
      title="Get Wallet State"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let code = ``;
  code += `<script lang="ts">\n`;
  code += `  import { BrowserWalletState } from "@meshsdk/svelte";\n`;
  code += `\n`;
  code += `  const { wallet, connected, name, connecting, connect, disconnect } = BrowserWalletState;\n`;
  code += `</script>`;

  return (
    <>
      <p>
        Provide information on the current wallet's state, and functions for
        connecting and disconnecting user wallet.
      </p>
      <Codeblock data={code} />
      <p>
        <code>wallet</code> is a{" "}
        <Link href="/apis/wallets/browserwallet">Browser Wallet</Link> instance,
        which expose all CIP wallets functions from getting assets to signing
        tranasction.
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
    </>
  );
}

function Right() {
  let example = ``;
  example += `<script lang="ts">\n`;
  example += `  import { CardanoWallet, BrowserWalletState } from "@meshsdk/svelte";\n`;
  example += `\n`;
  example += `  export async function getAddress() {\n`;
  example += `    const { wallet } = BrowserWalletState;\n`;
  example += `\n`;
  example += `    if (wallet) {\n`;
  example += `      const address = await wallet.getChangeAddress();\n`;
  example += `      console.log(address);\n`;
  example += `    }\n`;
  example += `  }\n`;
  example += `</script>\n`;
  example += `\n`;
  example += `<main>\n`;
  example += `  <CardanoWallet />\n`;
  example += `  <button on:click={getAddress}>getAddress</button>\n`;
  example += `</div>\n`;

  return (
    <LiveCodeDemo
      title="Wallet State"
      subtitle="Get the current wallet's state"
      code={example}
      childrenAfterCodeFunctions={true}
    ></LiveCodeDemo>
  );
}