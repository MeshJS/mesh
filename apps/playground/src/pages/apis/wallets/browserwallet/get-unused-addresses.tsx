import { useWallet } from "@meshsdk/react";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function BrowserWalletGetUnusedAddresses() {
  return (
    <TwoColumnsScroll
      sidebarTo="getUnusedAddresses"
      title="Get Unused Addresses"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let example = ``;
  example += `[\n`;
  example += `  "addr_test1qzk9x08mtre4jp8f7j8zu8802...r8c3grjmys7fl22c",\n`;
  example += `  "addr_test1qrmf35xyw2petfr0e0p4at0r7...8sc3grjmysm73dk8",\n`;
  example += `  "addr_test1qq6ts58hdaasd2q78fdjj0arm...i8c3grjmys85k8mf",\n`;
  example += `]\n`;
  return (
    <>
      <p>
        Returns a list of unused addresses controlled by the wallet. For
        example:
      </p>
      <Codeblock data={example} />
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();

  async function runDemo() {
    let results = await wallet.getUnusedAddresses();
    return results;
  }
  return (
    <LiveCodeDemo
      title="Get Unused Addresses"
      subtitle="Get addresses that are unused"
      code={`await wallet.getUnusedAddresses();`}
      runCodeFunction={runDemo}
      disabled={!connected}
      runDemoButtonTooltip={
        !connected ? "Connect wallet to run this demo" : undefined
      }
      runDemoShowBrowseWalletConnect={true}
    />
  );
}
