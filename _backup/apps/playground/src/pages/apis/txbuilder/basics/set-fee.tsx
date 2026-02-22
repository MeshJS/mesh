import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function TxbuilderSetFee() {
  return (
    <TwoColumnsScroll sidebarTo="setFee" title="Set Fee" leftSection={Left()} />
  );
}

function Left() {
  let code1 = ``;
  code1 += `const unsignedTx = await txBuilder\n`;
  code1 += `  .txOut(...)\n`;
  code1 += `  .changeAddress(...)\n`;
  code1 += `  .setFee("0")\n`;
  code1 += `  .complete();\n`;

  return (
    <>
      <p>Set the fee for the transaction.</p>
      <Codeblock data={`.setFee(fee: string)`} />
      <p>
        The following shows a simple example of building a transaction to send
        values with UTxO selection:
      </p>
      <Codeblock data={code1} />
    </>
  );
}
