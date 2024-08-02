import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function TxbuilderSetCollateral() {
  return (
    <TwoColumnsScroll
      sidebarTo="collateral"
      title="Set Collateral"
      leftSection={Left()}
    />
  );
}

function Left() {
  let code = ``;
  code += `txBuilder\n`;
  code += `  .txInCollateral(\n`;
  code += `    utxo.input.txHash,\n`;
  code += `    utxo.input.outputIndex,\n`;
  code += `    utxo.output.amount,\n`;
  code += `    utxo.output.address,\n`;
  code += `  )\n`;

  return (
    <>
      <p>Specify the UTXOs that you want to use as collateral.</p>
      <Codeblock data={code} />
    </>
  );
}
