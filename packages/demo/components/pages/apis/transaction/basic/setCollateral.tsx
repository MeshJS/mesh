import Codeblock from '../../../../ui/codeblock';
import SectionTwoCol from '../../../../common/sectionTwoCol';
import Link from 'next/link';

export default function SetCollateral() {
  return (
    <SectionTwoCol
      sidebarTo="setCollateral"
      header="Set Collateral"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
  let code1 = `setCollateral(collateral: UTxO[])`;

  return (
    <>
      <p>
        Specify the UTXOs that you want to use as collateral. This is especially
        useful if you are using <Link href="/apis/appwallet">App Wallet</Link>.
      </p>

      <Codeblock data={code1} isJson={false} />
    </>
  );
}

function Right() {
  return <></>;
}
