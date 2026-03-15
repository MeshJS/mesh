import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function AppWalletSignTx() {
  return (
    <TwoColumnsScroll
      sidebarTo="signTx"
      title="Create & sign transactions"
      leftSection={Left()}
    />
  );
}

function Left() {
  let example = ``;
  example += `signTx(\n`;
  example += `  unsignedTx: string,\n`;
  example += `  partialSign = false,\n`;
  example += `  accountIndex = 0,\n`;
  example += `  keyIndex = 0,\n`;
  example += `)`;

  return (
    <>
      <p>
        Sign a transaction with the App Wallet. Provide the unsigned transaction
        and the account and key index to sign the transaction. This function
        will return the signed transaction.
      </p>
      <Codeblock data={example} />
    </>
  );
}
