import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { SupportedListeners } from ".";

export default function ListenerOnTransactionConfirmed({
  provider,
  providerName,
}: {
  provider: SupportedListeners;
  providerName: string;
}) {
  return (
    <TwoColumnsScroll
      sidebarTo="onTxConfirmed"
      title="On Transaction Confirmed"
      leftSection={Left()}
    />
  );
}

function Left() {
  let code = ``;
  code += `const tx = new Transaction({ initiator: wallet });\n`;
  code += `tx.sendLovelace('addr_test1vpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0c7e4cxr', '5000000');\n`;
  code += `\n`;
  code += `const unsignedTx = await tx.build();\n`;
  code += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;
  code += `\n`;
  code += `provider.onTxConfirmed(txHash, () => {\n`;
  code += `  // Transaction confirmed\n`;
  code += `});\n`;

  return (
    <>
      <p>
        Allow you to listen to a transaction confirmation. Upon confirmation,
        the callback will be called.
      </p>
      <Codeblock data={code} />
    </>
  );
}
