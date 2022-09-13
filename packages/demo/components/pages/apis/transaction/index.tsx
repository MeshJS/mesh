import ApisLayout from '../common/layout';
import Burning from './burning';
import Hero from './hero';
import Minting from './minting';
import SendAda from './sendAda';
import SendAssets from './sendAssets';
export default function Transaction() {
  const sidebarItems = [
    { label: 'Send ADA to addresses', to: 'sendAda' },
    { label: 'Send multi-assets to addresses', to: 'sendAssets' },
    { label: 'Minting assets', to: 'minting' },
    { label: 'Burning assets', to: 'burning' },
    { label: 'Lock assets on smart contract', to: 'lockAssets' },
    { label: 'Unlock assets on smart contract', to: 'lockAssets' },
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
    </>
  );
}
