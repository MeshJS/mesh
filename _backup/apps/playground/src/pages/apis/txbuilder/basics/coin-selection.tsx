import Link from "~/components/link";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function TxbuilderCoinSelection() {
  return (
    <TwoColumnsScroll
      sidebarTo="coinSelection"
      title="Coin selection"
      leftSection={Left()}
    />
  );
}

function Left() {
  let code1 = ``;
  code1 += `txBuilder\n`;
  code1 += `  .txOut(address, [{ unit: "lovelace", quantity: amount }])\n`;
  code1 += `  .changeAddress(changeAddress)\n`;
  code1 += `  .selectUtxosFrom(utxos)\n`;
  code1 += `  .complete();\n`;

  let codeSignature = ``;
  codeSignature += `selectUtxosFrom(\n`;
  codeSignature += `  extraInputs: UTxO[]\n`;
  codeSignature += `  strategy?: UtxoSelectionStrategy\n`;
  codeSignature += `  threshold?: string\n`;
  codeSignature += `  includeTxFees?: boolean\n`;
  codeSignature += `)\n`;

  return (
    <>
      <p>
        You can select UTxOs from a list of UTxOs using the{" "}
        <code>selectUtxosFrom</code> method. This method allows you to specify
        the conditions for selecting UTxOs. The method signature is as follows:
      </p>
      <Codeblock data={codeSignature} />
      <p>
        The second parameter of <code>selectUtxosFrom</code> is the strategy to
        be used for selecting UTxOs. There are 4 strategies (
        <code>UtxoSelectionStrategy</code>) available for selecting UTxOs:
      </p>
      <ul>
        <li>experimental</li>
        <li>keepRelevant</li>
        <li>largestFirst</li>
        <li>largestFirstMultiAsset</li>
      </ul>
      <p>
        We may introduce more strategies in the future. Check the{" "}
        <Link href="https://docs.meshjs.dev/">Mesh Docs</Link> for more details.
      </p>
      <p>
        The <code>threshold</code> parameter is used to specify the minimum
        amount of lovelace to be selected. You may specify a larger amount to if
        the transactions requires it.
      </p>
      <p>
        The last parameter is <code>includeTxFees</code> which is a boolean
        value to include transaction fees in the selection.
      </p>
    </>
  );
}
