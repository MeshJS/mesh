import Link from "~/components/link";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function MeshWalletSignTx() {
  return (
    <TwoColumnsScroll
      sidebarTo="signTx"
      title="Sign Transaction"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        Requests user to sign the provided transaction (<code>tx</code>). The
        wallet should ask the user for permission, and if given, try to sign the
        supplied body and return a signed transaction. <code>partialSign</code>{" "}
        should be <code>true</code> if the transaction provided requires
        multiple signatures.
      </p>
    </>
  );
}

function Right() {
  return (
    <LiveCodeDemo
      title="Sign Transaction"
      subtitle="Create a transaction and sign it"
      code={`const signedTx = await wallet.signTx(tx, partialSign?);`}
    >
      <p>
        Check out <Link href="/apis/transaction">Transaction</Link> to learn
        more on how to use this API.
      </p>
    </LiveCodeDemo>
  );
}
