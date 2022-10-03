import ApisLayout from '../common/layout';
import Burning from './burning';
import DesignDatum from './datum';
// import GetSize from './getSize';
import Hero from './hero';
import LockAssets from './lockAssets';
import Minting from './minting';
import SendAda from './sendAda';
import SendAssets from './sendAssets';
import UnlockAssets from './unlockAssets';

export default function Transaction() {
  const sidebarItems = [
    { label: 'Send ADA to addresses', to: 'sendAda' },
    { label: 'Send multi-assets to addresses', to: 'sendAssets' },
    { label: 'Minting assets', to: 'minting' },
    { label: 'Burning assets', to: 'burning' },
    { label: 'Lock assets on smart contract', to: 'lockAssets' },
    { label: 'Unlock assets on smart contract', to: 'unlockAssets' },
    { label: 'Designing datum', to: 'datum' },
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
      <SendAda />
      <SendAssets />
      <Minting />
      <Burning />
      <LockAssets />
      <UnlockAssets />
      {/* <GetSize /> */}
      <DesignDatum />
    </>
  );
}
