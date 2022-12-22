import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../../../common/sectionTwoCol';
import { CardanoWallet } from '@meshsdk/react';
import Link from 'next/link';

export default function UiConnectWallet() {
  return (
    <>
      <SectionTwoCol
        sidebarTo="connectWallet"
        header="Connect Wallet"
        leftFn={Left()}
        rightFn={Right()}
      />
    </>
  );
}

function Left() {
  return (
    <>
      <p>
        In order for dApps to communicate with the user's wallet, we need a way
        to connect to their wallet.
      </p>
      <p>
        Add this <code>CardanoWallet</code> to allow the user to select a wallet
        to connect to your dApp. After the wallet is connected, see{' '}
        <Link href="/apis/browserwallet">Browser Wallet</Link> for a list of
        CIP-30 APIs.
      </p>
    </>
  );
}

function Right() {
  let code2 = `import { CardanoWallet } from '@meshsdk/react';\n\n`;
  code2 += `export default function Page() {\n`;
  code2 += `  return (\n`;
  code2 += `    <>\n`;
  code2 += `      <CardanoWallet />\n`;
  code2 += `    </>\n`;
  code2 += `  );\n`;
  code2 += `}\n`;

  return (
    <Card>
      <Codeblock data={code2} isJson={false} />
      <CardanoWallet />
    </Card>
  );
}
