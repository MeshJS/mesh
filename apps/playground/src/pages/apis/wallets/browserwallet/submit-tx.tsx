import Link from "~/components/link";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function BrowserWalletSubmitTransaction() {
  return (
    <TwoColumnsScroll
      sidebarTo="submitTx"
      title="Submit Transaction"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        As wallets should already have this ability to submit transaction, we
        allow apps to request that a transaction be sent through it. If the
        wallet accepts the transaction and tries to send it, it shall return the
        transaction ID for the app to track. The wallet can return error
        messages or failure if there was an error in sending it.
      </p>
    </>
  );
}

function Right() {
  return (
    <LiveCodeDemo
      title="Submit Transaction"
      subtitle="Submit a signed transaction with wallet"
      code={`const txHash = await wallet.submitTx(signedTx);`}
    >
      <p>
        Check out <Link href="/apis/transaction">Transaction</Link> to learn
        more on how to use this API.
      </p>
    </LiveCodeDemo>
  );
}
