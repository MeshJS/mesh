import { AppWallet } from "@meshsdk/core";

import Link from "~/components/link";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function AppWalletGenerateWallet() {
  return (
    <TwoColumnsScroll
      sidebarTo="generateWallet"
      title="Generate Wallet"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        You can generate deterministic keys based on the{" "}
        <Link href="https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki">
          Bitcoin BIP39
        </Link>
        . These mnemonic phrases allow you to recover your wallet.
      </p>
      <p>
        Once you have your mnemonic phrase, you can use it to generate your
        deterministic keys. See <code>Load AppWallet</code> in the following
        section on loading a mnemonic phrase. It will typically generate a
        series of private keys and corresponding public keys, which you can use
        to manage your cryptocurrencies.
      </p>
    </>
  );
}

function Right() {
  async function runDemo() {
    return AppWallet.brew();
  }

  return (
    <LiveCodeDemo
      title="Generate Wallet"
      subtitle="Generate new mnemonic phrases for wallet"
      code={`import { AppWallet } from '@meshsdk/core';\n\nconst mnemonic = AppWallet.brew();`}
      runCodeFunction={runDemo}
    />
  );
}
