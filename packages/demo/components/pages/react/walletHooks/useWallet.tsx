import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import RunDemoResult from '../../../common/runDemoResult';
import SectionTwoCol from '../../../common/sectionTwoCol';
import { useWallet } from '@meshsdk/react';
import { CardanoWallet } from '@meshsdk/react';
import Link from 'next/link';

export default function UseWallet() {
  return (
    <SectionTwoCol
      sidebarTo="useWallet"
      header="useWallet"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
  let code1 = `const { wallet, connected, name, connecting, connect, disconnect, error } = useWallet();`;

  return (
    <>
      <p>
        Provide information on the current wallet's state, and functions for
        connecting and disconnecting user wallet.
      </p>
      <Codeblock data={code1} isJson={false} />
      <p>
        <code>wallet</code> is a{' '}
        <Link href="/apis/browserwallet">Browser Wallet</Link> instance, which
        expose all CIP wallets functions from getting assets to signing
        tranasction.
      </p>
      <p>
        <code>connected</code>, a boolean, <code>true</code> if user's wallet is
        connected.
      </p>
      <p>
        <code>name</code>, a string, the name of the connect wallet.
      </p>
      <p>
        <code>connecting</code>, a boolean, <code>true</code> if the wallet is
        connecting and initializing.
      </p>
      <p>
        <code>connect(walletName: string)</code>, a function, provide the wallet
        name to connect wallet. Retrive a list of available wallets with{' '}
        <code>useWalletList()</code>.
      </p>
      <p>
        <code>disconnect()</code>, a function, to disconnect the connected
        wallet.
      </p>
    </>
  );
}

function Right() {
  const { connected, name, connecting, connect, disconnect, error } =
    useWallet();
  let code2 = `import { useWallet } from '@meshsdk/react';\n\n`;
  code2 += `export default function Page() {\n`;
  code2 += `  const { wallet, connected, name, connecting, connect, disconnect, error } = useWallet();\n\n`;
  code2 += `  return (\n`;
  code2 += `    <div>\n`;
  code2 += `      <p>\n`;
  code2 += `        <b>Connected?: </b> {connected ? 'Is connected' : 'Not connected'}\n`;
  code2 += `      </p>\n`;
  code2 += `      <p>\n`;
  code2 += `        <b>Connecting wallet?: </b> {connecting ? 'Connecting...' : 'No'}\n`;
  code2 += `      </p>\n`;
  code2 += `      <p>\n`;
  code2 += `        <b>Name of connected wallet: </b>\n`;
  code2 += `        {name}\n`;
  code2 += `      </p>\n`;
  code2 += `      <button onClick={() => disconnect()}>Disconnect Wallet</button>\n`;
  code2 += `    </div>\n`;
  code2 += `  );\n`;
  code2 += `}\n`;

  return (
    <Card>
      <Codeblock data={code2} isJson={false} />
      <CardanoWallet />
      <div>
        <p>
          <b>Connected?: </b> {connected ? 'Is connected' : 'Not connected'}
        </p>
        <p>
          <b>Connecting wallet?: </b> {connecting ? 'Connecting...' : 'No'}
        </p>
        <p>
          <b>Name of connected wallet: </b>
          {name}
        </p>
        <button onClick={() => disconnect()}>Disconnect Wallet</button>
      </div>
    </Card>
  );
}
