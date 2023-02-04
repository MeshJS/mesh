import CommonLayout from '../../../common/layout';
import Hero from './hero';
import UseAddress from './useAddress';
import UseAssets from './useAssets';
import UseLovelace from './useLovelace';
import UseNetwork from './useNetwork';
import UseWallet from './useWallet';
import UseWalletList from './useWalletList';

export default function ReactWalletHooks() {
  const sidebarItems = [
    { label: 'useWalletList', to: 'useWalletList' },
    { label: 'useAddress', to: 'useAddress' },
    { label: 'useAssets', to: 'useAssets' },
    { label: 'useLovelace', to: 'useLovelace' },
    { label: 'useNetwork', to: 'useNetwork' },
    { label: 'useWallet', to: 'useWallet' },
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
      <UseWalletList />
      <UseAddress />
      <UseAssets />
      <UseLovelace />
      <UseNetwork />
      <UseWallet />
    </>
  );
}
