import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function TransactionSetNetwork() {
  return (
    <TwoColumnsScroll
      sidebarTo="setNetwork"
      title="Set Network"
      leftSection={Left()}
    />
  );
}

function Left() {
  let code1 = `tx.setNetwork(network: Network)`;
  let code2 = `"testnet" | "preview" | "preprod" | "mainnet"`;

  return (
    <>
      <p>
        Sets the network to use, this is mainly to know the cost models to be
        used to calculate script integrity hash. You can set the network for the
        transaction with <code>setNetwork</code>.
      </p>
      <Codeblock data={code1} />
      <p>The network parameter is a string that can be one of the following:</p>
      <Codeblock data={code2} />
      <p></p>
    </>
  );
}
