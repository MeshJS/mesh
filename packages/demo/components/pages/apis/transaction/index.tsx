import ApisLayout from '../common/layout';
import Hero from './hero';
export default function Transaction() {
  const sidebarItems = [
    { label: 'Send ADA to addresses', to: 'sendAda' },
    { label: 'Send multi-assets to addresses', to: 'sendAssets' },
    { label: 'Lock assets on smart contract', to: 'lockAssets' },
    { label: 'Unlock assets on smart contract', to: 'lockAssets' },
    { label: 'Minting', to: 'minting' },
  ];
  return (
    <ApisLayout sidebarItems={sidebarItems}>
      <Hero />
      <Main />
    </ApisLayout>
  );
}

function Main() {
  return <></>;
}
