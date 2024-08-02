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
        Collateral is used to guarantee that nodes are compensated for their
        work in case phase-2 validation fails. Thus, collateral is the monetary
        guarantee a user gives to assure that the contract has been carefully
        designed and thoroughly tested. The collateral amount is specified at
        the time of constructing the transaction. Not directly, but by adding
        collateral inputs to the transaction. The total balance in the UTXOs
        corresponding to these specially marked inputs is the transaction’s
        collateral amount. If the user fulfills the conditions of the guarantee,
        and a contract gets executed, the collateral is safe.
      </p>
      <p>Example:</p>
      <Codeblock data={codeSample} />
    </>
  );
}
