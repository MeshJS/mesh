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
  code += `</script>`;

  return (
    <>
      <p>
        Obtain information on the current wallet's state, all fields on the{" "}
        <code>BrowserWalletState</code> JavaScript object are Svelte 5 runes,
        meaning when using the accessor, these values are reactive.
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
    </>
  );
}

function Right() {
  let example = ``;
  example += `<script lang="ts">\n`;
  example += `  import { CardanoWallet, BrowserWalletState } from "@meshsdk/svelte";\n`;
  example += `\n`;
  example += `  // Will run every time the underlying BrowserWallet instance changes.`;
  example += `  $effect(() => {\n`;
  example += `\n`;
  example += `    if (BrowserWalletState.wallet) {\n`;
  example += `      BrowserWalletState.wallet.getChangeAddress().then(address => {\n`;
  example += `        console.log(address);\n`;
  example += `      });\n`;
  example += `    }\n`;
  example += `  });\n`;
  example += `</script>\n`;
  example += `\n`;
  example += `<div>\n`;
  example += `  <CardanoWallet />\n`;
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
