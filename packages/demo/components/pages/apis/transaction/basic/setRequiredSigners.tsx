import Codeblock from '../../../../ui/codeblock';
import SectionTwoCol from '../../../../common/sectionTwoCol';
import Link from 'next/link';

export default function SetRequiredSigners() {
  return (
    <SectionTwoCol
      sidebarTo="setRequiredSigners"
      header="Set Required Signers"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
  let code1 = `setRequiredSigners(addresses: string[])`;

  return (
    <>
      <p>
        Sets the required signers for the transaction. This is useful if you are
        using <Link href="/apis/appwallet">App Wallet</Link> or in a
        multi-signature transaction.
      </p>

      <Codeblock data={code1} isJson={false} />
    </>
  );
}

function Right() {
  return <></>;
}
