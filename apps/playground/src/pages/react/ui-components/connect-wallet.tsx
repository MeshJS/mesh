import { CardanoWallet } from "@meshsdk/react";

import Link from "~/components/link";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { useDarkmode } from "~/hooks/useDarkmode";

export default function ReactConnectWallet() {
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
  const isDark = useDarkmode((state) => state.isDark);

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

  let codeMetamask = `<CardanoWallet\n`;
  codeMetamask += `  metamask={{network: "preprod"}}\n`;
  codeMetamask += `/>\n`;

  let codeCip95 = `<CardanoWallet\n`;
  codeCip95 += `  extensions={[95]}\n`;
  codeCip95 += `/>\n`;

  return (
    <>
      <p>
        In order for dApps to communicate with the user's wallet, we need a way
        to connect to their wallet.
      </p>

      <p>
        Add this CardanoWallet to allow the user to select a wallet to connect
        to your dApp. After the wallet is connected, see{" "}
        <Link href="/apis/wallets/browserwallet">Browser Wallet</Link> for a list of
        CIP-30 APIs.
      </p>

      <p>The signature for the CardanoWallet component is as follows:</p>

      <Codeblock data={codeSignature} />

      <h3>Customization</h3>
      <p>For dark mode style, add isDark.</p>
      <Codeblock data={`<CardanoWallet isDark={${isDark}} />`} />

      <p>For a custom label, add the label prop.</p>
      <Codeblock data={`<CardanoWallet label={"Connect Wallet"} />`} />

      <p>
        The customization is limited. For more customization, you can easily
        build your own wallet connection component. If you are using React, the{" "}
        <Link href="/react/wallet-hooks">React hooks</Link> will be useful. You
        may also take reference from{" "}
        <Link href="https://github.com/MeshJS/mesh/blob/main/packages/mesh-react/src/cardano-wallet/index.tsx">
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

      <h3>MetaMask Snaps</h3>
      <p>
        You can define the NuFi network to connect to by adding the{" "}
        <code>network</code> prop.
      </p>
      <Codeblock data={codeMetamask} />
      <p>
        This will connect to the preprod network. For the mainnet network, use{" "}
        <code>mainnet</code>.
      </p>
      <p>
        You can also define a custom network by passing a URL string to the{" "}
        <code>network</code> prop.
      </p>

      <h3>CIP 95</h3>
      <p>
        You can also provide an <code>extensions</code> object to enable
        specific CIPs. For example, to enable CIP95, you would pass:
      </p>
      <Codeblock data={codeCip95} />
    </>
  );
}

function Right() {
  const isDark = useDarkmode((state) => state.isDark);

  let example = ``;
  example += `import { CardanoWallet } from '@meshsdk/react';\n`;
  example += `\n`;
  example += `export default function Page() {\n\n`;

  example += `  function afterConnectedWallet() {\n`;
  example += `    // do something\n`;
  example += `  }\n\n`;

  example += `  return (\n`;
  example += `    <>\n`;
  example += `      <CardanoWallet\n`;
  example += `        label={"Connect a Wallet"}\n`;
  example += `        isDark={isDark}\n`;
  example += `        onConnected={afterConnectedWallet}\n`;
  example += `        metamask={{ network: "preprod" }}\n`;
  example += `      />\n`;
  example += `    </>\n`;
  example += `  );\n`;
  example += `}\n`;

  return (
    <LiveCodeDemo
      title="Connect Wallet Component"
      subtitle="Connect to user's wallet to interact with dApp"
      code={example}
      childrenAfterCodeFunctions={true}
    >
      <CardanoWallet
        label={"Connect a Wallet"}
        isDark={isDark}
        metamask={{ network: "preprod" }}
      />
    </LiveCodeDemo>
  );
}
