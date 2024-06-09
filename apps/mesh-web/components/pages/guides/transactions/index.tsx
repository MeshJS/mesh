import type { NextPage } from 'next';
import GuidesLayout from '../layout';
import Metatags from '../../../../components/site/metatags';
import Hero from './hero';
import Init from './init';
import SendADA from './sendAda';
import MintToken from './mintToken';

const GuideMintingNodejsPage: NextPage = () => {
  const sidebarItems = [
    { label: 'Initialize App Wallet', to: 'init' },
    { label: 'Send ADA', to: 'sendada' },
    { label: 'Mint tokens', to: 'XX' },
    { label: 'Send multiple assets', to: 'XX' },
    { label: 'Lock to script', to: 'XX' },
    { label: 'Redeem from script', to: 'XX' },
  ];

  return (
    <>
      <Metatags
        title="Transactions - From Zero to Hero"
        description="A guide to building transactions using App Wallet"
        image="/guides/minting-application.png"
      />
      <GuidesLayout
        title="Transactions - From Zero to Hero"
        desc="A guide to building transactions using App Wallet"
        sidebarItems={sidebarItems}
        image="/guides/art-g68512aa8d_1280.jpg"
      >
        <Hero />
        <Init />
        <SendADA />
        <MintToken />
      </GuidesLayout>
    </>
  );
};

export default GuideMintingNodejsPage;
