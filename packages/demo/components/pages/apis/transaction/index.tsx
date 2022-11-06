import CommonLayout from '../../../common/layout';
import Burning from './burning';
import CoinSelection from './coinSelection';
import DesignDatum from './datum';
import Hero from './hero';
import LockAssets from './lockAssets';
import Minting from './minting';
import SendAda from './sendAda';
import SendAssets from './sendAssets';
import SetTimeLimit from './setTimeLimit';
import UnlockAssets from './unlockAssets';
import UsingRedeemer from './redeemer';

export default function Transaction() {
  const sidebarItems = [
    { label: 'Send ADA to addresses', to: 'sendAda' },
    { label: 'Send multi-assets to addresses', to: 'sendAssets' },
    { label: 'Minting assets', to: 'minting' },
    { label: 'Burning assets', to: 'burning' },
    { label: 'Lock assets in smart contract', to: 'lockAssets' },
    { label: 'Unlock assets from smart contract', to: 'unlockAssets' },
    { label: 'Designing datum', to: 'datum' },
    { label: 'Using redeemer', to: 'redeemer' },
    { label: 'Set time limit', to: 'setTimeLimit' },
    { label: 'Coin Selection', to: 'coinSelection' },
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
      <SendAda />
      <SendAssets />
      <Minting />
      <Burning />
      <LockAssets />
      <UnlockAssets />
      <DesignDatum />
      <UsingRedeemer />
      <SetTimeLimit />
      <CoinSelection />
    </>
  );
}
