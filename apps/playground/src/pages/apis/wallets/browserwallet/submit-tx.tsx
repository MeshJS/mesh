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
        Wallets inherently have the ability to submit transactions. This API
        allows applications to request the wallet to send a transaction. If the
        wallet accepts the transaction and successfully sends it, it will return
        the transaction ID, enabling the application to track its status. In
        case of errors during submission, the wallet will provide error messages
        or failure details.
      </p>
      <p>
        This functionality is useful for applications that need to interact with
        the blockchain by submitting signed transactions through the user's
        wallet.
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
