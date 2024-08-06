import Link from "~/components/link/link";

import { MeshWallet } from "@meshsdk/core";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function MeshWalletGenerateWallet() {
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
        <Link
          href="https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki"
          target="_blank"
          rel="noreferrer"
        >
          Bitcoin BIP39
        </Link>
        . These mnemonic phrases allow you to recover your wallet.
      </p>
      <Codeblock data={`const mnemonic = MeshWallet.brew();`} />
      <p>
        Once you have your mnemonic phrase, you can use it to generate your
        deterministic keys. It will typically generate a series of private keys
        and corresponding public keys, which you can use to manage your
        cryptocurrencies.
      </p>
      <p>
        You can also generate private keys directly by adding true in the brew
        function.
      </p>
      <Codeblock data={`const privatekey = MeshWallet.brew(true);`} />
    </>
  );
}

function Right() {
  async function runDemo() {
    const mnemonic = MeshWallet.brew();
    return mnemonic;
  }

  return (
    <LiveCodeDemo
      title="Generate Wallet"
      subtitle="Generate new mnemonic phrases for your wallet"
      code={`const mnemonic = MeshWallet.brew();`}
      runCodeFunction={runDemo}
    />
  );
}
