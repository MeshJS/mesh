import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import useMeshWallet from "~/contexts/mesh-wallet";

export default function MeshWalletGetUsedAddresses() {
  return (
    <TwoColumnsScroll
      sidebarTo="getUsedAddresses"
      title="Get Used Addresses"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let example = ``;
  example += `[
`;
  example += `  "addr_test1qzk9x08mtre4jp8f7j8zu8802...r8c3grjmys7fl88a",
`;
  example += `  "addr_test1qrmf35xyw2petfr0e0p4at0r7...8sc3grjmysm76gt3",
`;
  example += `  "addr_test1qq6ts58hdaasd2q78fdjj0arm...i8c3grjmys85dn39",
`;
  example += `]
`;

  return (
    <>
      <p>
        This API retrieves a list of used addresses controlled by the wallet. Used addresses are wallet-controlled addresses that have been involved in transactions.
      </p>
      <p>
        Tracking used addresses is essential for analyzing transaction history and managing wallet activity. These addresses provide insights into past transactions.
      </p>
      <p>Example response:</p>
      <Codeblock data={example} />
    </>
  );
}

function Right() {
  const { getWallet } = useMeshWallet();
  async function runDemo() {
    const wallet = getWallet();
    let results = wallet.getUsedAddresses();
    return results;
  }
  return (
    <LiveCodeDemo
      title="Get Used Addresses"
      subtitle="Get addresses that are used"
      code={`const usedAddresses = wallet.getUsedAddresses();`}
      runCodeFunction={runDemo}
    />
  );
}
