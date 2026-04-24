import Link from "~/components/link";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function TransactionGetTxbuilder() {
  return (
    <TwoColumnsScroll
      sidebarTo="getTxbuilder"
      title="Get Txbuilder"
      leftSection={Left()}
    />
  );
}

function Left() {
  let code1 = ``;
  code1 += `const tx = new Transaction({ initiator: wallet });\n`;
  code1 += `tx.foo();\n`;
  code1 += `\n`;
  code1 += `tx.txBuilder.bar()\n`;

  let code2 = `tx.txBuilder.meshTxBuilderBody;`;

  return (
    <>
      <p>
        The <Link href="/apis/txbuilder">TxBuilder</Link> is a powerful
        low-level APIs that allows you to build and sign transactions. You can
        get a new instance of TxBuilder by calling <code>txBuilder</code>. Doing
        so allows you to access the low-level APIs of TxBuilder,{" "}
        <Link href="https://docs.meshjs.dev/transactions/classes/MeshTxBuilder">
          check the docs
        </Link>{" "}
        for all the available methods.
      </p>
      <Codeblock data={code1} />
      <p>
        For example, you can get the <code>meshTxBuilderBody</code> to retrieve
        the transaction JSON. This is useful for debugging and understanding how
        the transaction is built.
      </p>
      <Codeblock data={code2} />
    </>
  );
}
