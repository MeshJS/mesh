import Link from 'next/link';
import Codeblock from '../../../ui/codeblock';
import SectionTwoCol from '../common/sectionTwoCol';

export default function SubmitTransaction() {
  return (
    <SectionTwoCol
      sidebarTo="submitTx"
      header="Submit Transaction"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        As wallets should already have this ability to submit transaction, we
        allow dApps to request that a transaction be sent through it. If the
        wallet accepts the transaction and tries to send it, it shall return the
        transaction ID for the dApp to track. The wallet can return error
        messages or failure if there was an error in sending it. Check out{' '}
        <Link href="/apis/transaction">Transaction</Link> to learn more on how
        to use this API.
      </p>
      <Codeblock
        data={`const txHash = await wallet.submitTx();`}
        isJson={false}
      />
    </>
  );
}

function Right() {
  return <></>;
}
