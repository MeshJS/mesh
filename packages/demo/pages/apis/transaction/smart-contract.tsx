import { NewspaperIcon } from '@heroicons/react/24/solid';
import type { NextPage } from 'next';
import CommonLayout from '../../../components/common/layout';
import CommonHero from '../../../components/pages/apis/transaction/commonHero';
import DesignDatum from '../../../components/pages/apis/transaction/smart-contract/datum';
import LockAssets from '../../../components/pages/apis/transaction/smart-contract/lockAssets';
import UsingRedeemer from '../../../components/pages/apis/transaction/smart-contract/redeemer';
import PlutusMinting from '../../../components/pages/apis/transaction/smart-contract/plutus-minting';
import UnlockAssets from '../../../components/pages/apis/transaction/smart-contract/unlockAssets';
import Metatags from '../../../components/site/metatags';
import InlineDatum from '../../../components/pages/apis/transaction/smart-contract/inlineDatum';
import ReferenceScript from '../../../components/pages/apis/transaction/smart-contract/referenceScript';

const TransactionMintingPage: NextPage = () => {
  const sidebarItems = [
    { label: 'Lock assets in smart contract', to: 'lockAssets' },
    { label: 'Unlock assets from smart contract', to: 'unlockAssets' },
    { label: 'Minting assets with smart contract', to: 'plutusminting' },
    { label: 'Inline datum', to: 'inlineDatum' },
    { label: 'Reference script', to: 'referenceScript' },
    { label: 'Designing datum', to: 'datum' },
    { label: 'Using redeemer', to: 'redeemer' },
  ];

  return (
    <>
      <Metatags
        title="Interact with smart contracts"
        description="Create transactions to work with smart contracts."
      />
      <CommonLayout sidebarItems={sidebarItems}>
        <CommonHero
          title="Interact with smart contracts"
          desc="Create transactions to work with smart contracts."
          icon={<NewspaperIcon className="w-16 h-16" />}
        />
        <LockAssets />
        <UnlockAssets />
        <PlutusMinting />
        <InlineDatum />
        <ReferenceScript />
        <DesignDatum />
        <UsingRedeemer />
      </CommonLayout>
    </>
  );
};

export default TransactionMintingPage;
