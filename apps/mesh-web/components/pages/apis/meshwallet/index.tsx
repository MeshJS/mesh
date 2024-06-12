import CommonLayout from '../../../common/layout';
import Hero from './hero';
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
import GetCollateral from './getCollateral';
import LoadWallet from './loadWallet';
import CreateCollateral from './createCollateral';
import GenerateWallet from './generateWallet';

export default function MeshWallet() {
  const sidebarItems = [
    { label: 'Initialize wallet', to: 'initWallet' },
    { label: 'Generate wallet', to: 'generateWallet' },
    { label: 'Get balance', to: 'getBalance' },
    { label: 'Get change address', to: 'getChangeAddress' },
    { label: 'Get collateral', to: 'getCollateral' },
    { label: 'Get network ID', to: 'getNetworkId' },
    { label: 'Get reward addresses', to: 'getRewardAddresses' },
    { label: 'Get unused addresses', to: 'getUnusedAddresses' },
    { label: 'Get used addresses', to: 'getUsedAddresses' },
    { label: 'Get UTXOs', to: 'getUtxos' },
    { label: 'Sign data', to: 'signData' },
    { label: 'Sign transaction', to: 'signTx' },
    { label: 'Submit transaction', to: 'submitTx' },
    { label: 'Create collateral', to: 'createCollateral' },
    { label: 'Get assets', to: 'getAssets' },
    { label: 'Get lovelace', to: 'getLovelace' },
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
      <LoadWallet />
      <GenerateWallet />
      <GetBalance />
      <GetChangeAddress />
      <GetCollateral />
      <GetNetworkId />
      <GetRewardAddresses />
      <GetUnusedAddresses />
      <GetUsedAddresses />
      <GetUtxos />
      <SignData />
      <SignTx />
      <SubmitTransaction />
      <CreateCollateral />
      <GetAssets />
      <GetLovelace />
      <GetPolicyIds />
      <GetPolicyIdAssets />
    </>
  );
}
