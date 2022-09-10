import ApisLayout from '../common/layout';
export default function Transaction() {
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
      {/* <Hero /> */}
      <Main />
    </ApisLayout>
  );
}

function Main() {
  return (
    <>
    Transaction
      <br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/>
    </>
  );
}
