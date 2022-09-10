import ApisLayout from '../common/layout';
import GetInstalledWallets from './getInstalledWallets';
import Hero from './hero';
import { Link, Element } from 'react-scroll';
import ConnectWallet from './connectWallet';
import GetBalance from './getBalance';

export default function BrowserWallet() {
  const sidebarItems = [
    { label: 'Get installed wallets', to: 'getInstallWallets' },
    { label: 'Connect wallet', to: 'connectWallet' },
    { label: 'Get balance', to: 'getBalance' },
    { label: 'Get change address', to: 'getChangeAddress' },
    { label: 'Get network ID', to: 'getNetworkID' },
    { label: 'Get reward address', to: 'getRewardAddress' },
    { label: 'Get used address', to: 'getUsedAddress' },
    { label: 'Get unused address', to: 'getUnusedAddress' },
    { label: 'Get UTXOs', to: 'getUtxos' },
  ];
  return (
    <ApisLayout sidebarItems={sidebarItems}>
      <Hero />
      <Main />
    </ApisLayout>
  );
}

function Main() {
  return (
    <>
      <GetInstalledWallets />
      <ConnectWallet />
      <GetBalance />
      <br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/>
    </>
  );
}
