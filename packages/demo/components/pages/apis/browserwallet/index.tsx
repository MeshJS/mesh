import CommonLayout from '../../../common/layout';
import GetInstalledWallets from './getInstalledWallets';
import Hero from './hero';
import ConnectWallet from './connectWallet';
import GetBalance from './getBalance';
import GetChangeAddress from './getChangeAddress';
import GetNetworkId from './getNetworkId';
import GetRewardAddresses from './getRewardAddresses';
import GetUnusedAddresses from './getUnusedAddresses';
import GetUsedAddresses from './getUsedAddresses';
import GetUtxos from './getUtxos';
import SignData from './signData';
import SignTx from './signTx';
import SubmitTransaction from './submitTx';
import GetLovelace from './getLovelace';
import GetAssets from './getAssets';
import GetPolicyIds from './getPolicyIds';
import GetPolicyIdAssets from './getPolicyIdAssets';

export default function BrowserWallet() {
  const sidebarItems = [
    { label: 'Get installed wallets', to: 'getInstallWallets' },
    { label: 'Connect wallet', to: 'connectWallet' },
    { label: 'Get balance', to: 'getBalance' },
    { label: 'Get change address', to: 'getChangeAddress' },
    { label: 'Get network ID', to: 'getNetworkId' },
    { label: 'Get reward addresses', to: 'getRewardAddresses' },
    { label: 'Get used addresses', to: 'getUsedAddresses' },
    { label: 'Get unused addresses', to: 'getUnusedAddresses' },
    { label: 'Get UTXOs', to: 'getUtxos' },
    { label: 'Sign data', to: 'signData' },
    { label: 'Sign transaction', to: 'signTx' },
    { label: 'Submit transaction', to: 'submitTx' },
    { label: 'Get lovelace', to: 'getLovelace' },
    { label: 'Get assets', to: 'getAssets' },
    { label: 'Get policy IDs', to: 'getPolicyIds' },
    { label: 'Get collection of assets', to: 'getPolicyIdAssets' },
  ];
  return (
    <CommonLayout sidebarItems={sidebarItems}>
      <Hero />
      <Main />
    </CommonLayout>
  );
}

function Main() {
  return (
    <>
      <GetInstalledWallets />
      <ConnectWallet />
      <GetBalance />
      <GetChangeAddress />
      <GetNetworkId />
      <GetRewardAddresses />
      <GetUsedAddresses />
      <GetUnusedAddresses />
      <GetUtxos />
      <SignData />
      <SignTx />
      <SubmitTransaction />
      <GetLovelace />
      <GetAssets />
      <GetPolicyIds />
      <GetPolicyIdAssets />
    </>
  );
}
