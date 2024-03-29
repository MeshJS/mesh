import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../../../common/sectionTwoCol';
import { useWallet, useWalletList } from '@meshsdk/react';

import ConnectCipWallet from '../../../common/connectCipWallet';

export default function ConnectWallet() {
  return (
    <SectionTwoCol
      sidebarTo="connectWallet"
      header="Connect Wallet"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        This is the entrypoint to start communication with the user&apos;s
        wallet. The wallet should request the user&apos;s permission to connect
        the web page to the user&apos;s wallet, and if permission has been
        granted, the wallet will be returned and exposing the full API for the
        dApp to use.
      </p>
      <p>
        Query <code>BrowserWallet.getInstalledWallets()</code> to get a list of
        available wallets, then provide the wallet <code>name</code> for which
        wallet the user would like to connect with.
      </p>
    </>
  );
}

function Right() {
  const { name } = useWallet();

  return (
    <Card>
      <div className="p-5 text-lg font-semibold text-left text-gray-900 bg-white dark:text-white dark:bg-gray-800">
        Connect Wallet
        <p className="mt-1 text-sm font-normal text-gray-500 dark:text-gray-400">
          Connect to a CIP30 compatible wallet
        </p>
      </div>

      <Codeblock
        data={`const wallet = await BrowserWallet.enable('${
          name ? name : 'eternl'
        }');`}
        isJson={false}
      />
      {<ConnectCipWallet />}
    </Card>
  );
}
