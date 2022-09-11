import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../common/sectionTwoCol';
import useWallet from '../../../../contexts/wallet';
import ConnectCipWallet from '../common/connectCipWallet';

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
  const { walletNameConnected } = useWallet();
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
      <Codeblock
        data={`const wallet = BrowserWallet.enable('${
          walletNameConnected ? walletNameConnected : 'eternl'
        }');`}
        isJson={false}
      />
    </>
  );
}

function Right() {
  return (
    <Card>
      <ConnectCipWallet />
    </Card>
  );
}
