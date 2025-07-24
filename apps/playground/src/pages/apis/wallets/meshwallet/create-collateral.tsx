import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function MeshWalletCreateCollateral() {
  return (
    <TwoColumnsScroll
      sidebarTo="createCollateral"
      title="Create Collateral UTXO"
      leftSection={Left()}
    />
  );
}

function Left() {
  let codeSample = ``;
  codeSample += `const txhash = await wallet.createCollateral();`;

  return (
    <>
      <p>
        Collateral is a monetary guarantee provided by the user to ensure the
        integrity of smart contracts and compensate nodes in case phase-2
        validation fails. It is specified during transaction construction by
        adding collateral inputs to the transaction.
      </p>
      <p>
        The total balance in the UTXOs corresponding to these inputs represents
        the transaction's collateral amount. If the contract executes successfully,
        the collateral remains safe. This mechanism ensures that contracts are
        carefully designed and thoroughly tested.
      </p>
      <p>Example:</p>
      <Codeblock data={codeSample} />
    </>
  );
}
