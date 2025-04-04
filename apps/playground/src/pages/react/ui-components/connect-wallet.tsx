import { CommonCardanoWallet } from "~/components/cardano/connect-browser-wallet";
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

  let codePersist = `<CardanoWallet\n`;
  codePersist += `  persist={true}\n`;
  codePersist += `/>\n`;

  let codeBurner = `<CardanoWallet\n`;
  codeBurner += `  burnerWallet={{\n`;
  codeBurner += `    networkId: 0,\n`;
  codeBurner += `    provider: provider,\n`;
  codeBurner += `  }}\n`;
  codeBurner += `/>\n`;

  let codeMetamask = `<CardanoWallet\n`;
  codeMetamask += `  injectFn={async () => await checkIfMetamaskInstalled("preprod")}\n`;
  codeMetamask += `/>\n`;

  let codeWeb3Services = `const provider = new BlockfrostProvider('<BLOCKFROST_API_KEY>');\n\n`;
  codeWeb3Services += `<CardanoWallet\n`;
  codeWeb3Services += `  web3Services={{\n`;
  codeWeb3Services += `    networkId: 0,\n`;
  codeWeb3Services += `    fetcher: provider,\n`;
  codeWeb3Services += `    submitter: provider,\n`;
  codeWeb3Services += `  }}\n`;
  codeWeb3Services += `/>\n`;

  return (
    <>
      <p>
        In order for pps to communicate with the user's wallet, we need a way
        to connect to their wallet.
      </p>

      <p>
        Add this CardanoWallet to allow the user to select a wallet to connect
        to your app. After the wallet is connected, see{" "}
        <Link href="/apis/wallets/browserwallet">Browser Wallet</Link> for a
        list of CIP-30 APIs.
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

      <h3>Persist user session</h3>
      <p>
        If you would like to save the user last connected wallet and
        automatically connect to it on the next visit, you can use the persist
        prop.
      </p>
      <Codeblock data={codePersist} />

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

      <h3>Mesh Web3 Services</h3>
      <p>
        <Link href="https://web3.meshjs.dev/">Mesh Web3 Services</Link>{" "}
        streamline user onboarding and on-chain feature integration,
        accelerating your app's time to market.
      </p>
      <p>
        To integrate Mesh Web3 Services, use the <code>web3Services</code> prop.
        The <code>networkId</code> is the network ID of the wallet you are
        connecting to. You may use any <Link href="/providers">providers</Link>{" "}
        for <code>fetcher</code> and <code>submitter</code>.
      </p>
      <Codeblock data={codeWeb3Services} />

      <h3>Decentralized WebRTC Wallet Communication (CIP 45)</h3>
      <p>
        <Link href="https://cips.cardano.org/cip/CIP-45">CIP-45</Link> is a
        communication method between pps and wallets based on WebTorrent
        trackers and WebRTC. Using WebTorrent trackers for the peer discovery to
        remove the need of this central component.
      </p>

      <h3>Burner wallet</h3>
      <p>
        Burner wallets are wallets that are created on the fly on the user's
        device. They are temporary wallets useful for testing purposes. The
        private keys are generated and stored on the user's device.
      </p>
      <Codeblock data={codeBurner} />

      <h3>MetaMask Snaps</h3>
      <p>
        MetaMask Snaps are a new way to extend MetaMask with custom
        functionality and integrations. You can check the implementation to
        integrate NuFi from the{" "}
        <Link href="https://github.com/MeshJS/mesh/tree/main/apps/playground/src/components/cardano/connect-browser-wallet">
          GitHub repository
        </Link>
        .
      </p>
      <p>
        Use the <code>injectFn</code> prop to add custom functionality.
      </p>
      <Codeblock data={codeMetamask} />
    </>
  );
}

function Right() {
  let example = ``;
  example += `import { CardanoWallet } from '@meshsdk/react';\n`;
  example += `\n`;
  example += `export default function Page() {\n`;
  example += `  return (\n`;
  example += `    <>\n`;
  example += `      <CardanoWallet\n`;
  example += `        label={"Connect a Wallet"}\n`;
  example += `        persist={true}\n`;
  example += `        onConnected={()=>{console.log('on connected')}}\n`;
  example += `        cardanoPeerConnect={{\n`;
  example += `          dAppInfo: {\n`;
  example += `            name: "Mesh SDK",\n`;
  example += `            url: "https://meshjs.dev/",\n`;
  example += `          },\n`;
  example += `          announce: [\n`;
  example += `            "wss://dev.btt.cf-identity-wallet.metadata.dev.cf-deployments.org",\n`;
  example += `          ],\n`;
  example += `        }}\n`;
  example += `        burnerWallet={{\n`;
  example += `          networkId: 0,\n`;
  example += `          provider: provider,\n`;
  example += `        }}\n`;
  example += `      />\n`;
  example += `    </>\n`;
  example += `  );\n`;
  example += `}\n`;

  return (
    <LiveCodeDemo
      title="Connect Wallet Component"
      subtitle="Connect to user's wallet to interact with app"
      code={example}
      childrenAfterCodeFunctions={true}
    >
      <CommonCardanoWallet />
    </LiveCodeDemo>
  );
}
