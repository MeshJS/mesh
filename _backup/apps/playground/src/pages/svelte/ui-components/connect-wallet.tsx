import Link from "~/components/link";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { useDarkmode } from "~/hooks/useDarkmode";

export default function SvelteConnectWallet() {
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
  let codeSignature = ``;
  codeSignature += `{\n`;
  codeSignature += `  label?: string;\n`;
  codeSignature += `  onConnected?: Function;\n`;
  codeSignature += `  isDark?: boolean;\n`;
  codeSignature += `}\n`;

  let codeRunCode = ``;
  codeRunCode += `export default function Page() {\n\n`;
  codeRunCode += `  function afterConnectedWallet() {\n`;
  codeRunCode += `    // do something\n`;
  codeRunCode += `  }\n\n`;
  codeRunCode += `  return (\n`;
  codeRunCode += `    <>\n`;
  codeRunCode += `      <CardanoWallet onConnected={afterConnectedWallet} />\n`;
  codeRunCode += `    </>\n`;
  codeRunCode += `  );\n`;
  codeRunCode += `}\n`;

  let codeCip95 = `<CardanoWallet\n`;
  codeCip95 += `  extensions={[95]}\n`;
  codeCip95 += `/>\n`;

  return (
    <>
      <p>
        In order for apps to communicate with the user's wallet, we need a way
        to connect to their wallet.
      </p>

      <p>
        Add <code>CardanoWallet</code> to allow the user to select a wallet to
        connect to your app. After the wallet is connected, see{" "}
        <Link href="/apis/wallets/browserwallet">Browser Wallet</Link> for a
        list of CIP-30 APIs.
      </p>

      <p>
        The signature for the <code>CardanoWallet</code> component is as
        follows:
      </p>

      <Codeblock data={codeSignature} />

      <h3>Customization</h3>
      <p>For dark mode style, add isDark.</p>
      <Codeblock data={`<CardanoWallet isDark={true} />`} />

      <p>For a custom label, add the label prop.</p>
      <Codeblock data={`<CardanoWallet label={"Connect a Wallet"} />`} />

      <p>
        The customization is limited. For more customization, you can easily
        build your own wallet connection component. You may also take reference
        from{" "}
        <Link href="https://github.com/MeshJS/mesh/tree/main/packages/mesh-svelte/src/lib/cardano-wallet">
          this component
        </Link>
        .
      </p>

      <h3>onConnected</h3>
      <p>
        If you want to run a function after the wallet is connected, you can add
        the onConnected prop.
      </p>

      <Codeblock data={codeRunCode} />
      <p>
        The above code will log "Hello, World!" to the console when the wallet
        is connected.
      </p>
    </>
  );
}

function Right() {
  let example = ``;
  example += `<script lang="ts">\n`;
  example += `  import { CardanoWallet } from "@meshsdk/svelte";\n`;
  example += `</script>\n`;
  example += `\n`;
  example += `<main>\n`;
  example += `  <CardanoWallet />\n`;
  example += `</main>\n`;

  return (
    <LiveCodeDemo
      title="Connect Wallet Component"
      subtitle="Connect to user's wallet to interact with app"
      code={example}
      childrenAfterCodeFunctions={true}
    ></LiveCodeDemo>
  );
}
