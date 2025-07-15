import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import useMeshWallet from "~/contexts/mesh-wallet";

export default function MeshWalletGetUnusedAddresses() {
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
  example += `[
`;
  example += `  "addr_test1qzk9x08mtre4jp8f7j8zu8802...r8c3grjmys7fl22c",
`;
  example += `  "addr_test1qrmf35xyw2petfr0e0p4at0r7...8sc3grjmysm73dk8",
`;
  example += `  "addr_test1qq6ts58hdaasd2q78fdjj0arm...i8c3grjmys85k8mf",
`;
  example += `]
`;

  return (
    <>
      <p>
        This API retrieves a list of unused addresses controlled by the wallet. Unused addresses are wallet-controlled addresses that have not been involved in any transactions.
      </p>
      <p>
        Unused addresses are important for maintaining privacy and security in transactions. They can be used for new transactions without revealing previous activity.
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
    let results = wallet.getUnusedAddresses();
    return results;
  }
  return (
    <LiveCodeDemo
      title="Get Unused Addresses"
      subtitle="Get addresses that are unused"
      code={`const unusedAddresses = wallet.getUnusedAddresses();`}
      runCodeFunction={runDemo}
    />
  );
}
