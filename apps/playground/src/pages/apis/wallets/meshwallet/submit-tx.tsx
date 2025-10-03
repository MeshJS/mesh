import Link from "~/components/link";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function MeshWalletSubmitTransaction() {
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
        This API allows applications to request the submission of a signed
        transaction through the connected wallet. The wallet will attempt to
        send the transaction to the blockchain network.
      </p>
      <p>
        If the transaction is successfully submitted, the wallet returns the
        transaction ID, which can be used by the application to track its status
        on the blockchain. In case of an error during submission, the wallet
        provides error messages or failure details.
      </p>
      <p>
        This functionality is essential for applications that rely on wallet
        integration to handle transaction submission securely and efficiently.
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
