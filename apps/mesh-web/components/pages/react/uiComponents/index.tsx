import CommonLayout from '../../../common/layout';
// import UiResolveMedia from './resolveMedia';
import UiConnectWallet from './connectWallet';
import Hero from './hero';
import UiPoweredByMesh from './poweredByMesh';
import UiStakeButton from './stakeButton';

export default function ReactUiComponents() {
  const sidebarItems = [
    { label: 'Connect wallet', to: 'connectWallet' },
    { label: 'Stake ADA', to: 'stakeButton' },
    { label: 'Powered by Mesh', to: 'poweredByMesh' },
    // { label: 'Resolve Media', to: 'resolveMedia' },
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
      <UiConnectWallet />
      <UiStakeButton />
      <UiPoweredByMesh />
      {/* <UiResolveMedia /> */}
    </>
  );
}
