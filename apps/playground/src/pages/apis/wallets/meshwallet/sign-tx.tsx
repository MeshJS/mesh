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
        This API enables applications to request the signing of a transaction
        using the private keys managed by the connected wallet. Signing a
        transaction is a critical step in ensuring its authenticity and
        authorization.
      </p>
      <p>
        The wallet ensures that the transaction is signed securely, preventing
        unauthorized access to private keys. Once signed, the transaction can be
        submitted to the blockchain network for processing.
      </p>
      <p>
        This functionality is vital for applications that need to interact with
        the blockchain securely, as it delegates sensitive operations to the
        wallet.
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
