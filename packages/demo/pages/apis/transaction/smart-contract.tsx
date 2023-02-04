import { NewspaperIcon } from '@heroicons/react/24/solid';
import type { NextPage } from 'next';
import CommonLayout from '../../../components/common/layout';
import CommonHero from '../../../components/pages/apis/transaction/commonHero';
import DesignDatum from '../../../components/pages/apis/transaction/datum';
import LockAssets from '../../../components/pages/apis/transaction/lockAssets';
import UsingRedeemer from '../../../components/pages/apis/transaction/redeemer';
import PlutusMinting from '../../../components/pages/apis/transaction/smart-contract/plutus-minting';
import UnlockAssets from '../../../components/pages/apis/transaction/unlockAssets';
import Metatags from '../../../components/site/metatags';

const TransactionMintingPage: NextPage = () => {
  const sidebarItems = [
    { label: 'Lock assets in smart contract', to: 'lockAssets' },
    { label: 'Unlock assets from smart contract', to: 'unlockAssets' },
    { label: 'Minting assets with smart contract', to: 'plutusminting' },
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
        <DesignDatum />
        <UsingRedeemer />
      </CommonLayout>
    </>
  );
};

export default TransactionMintingPage;
