import { FireIcon } from '@heroicons/react/24/solid';
import type { NextPage } from 'next';
import CommonLayout from '../../../components/common/layout';
import Burning from '../../../components/pages/apis/transaction/burning';
import CommonHero from '../../../components/pages/apis/transaction/commonHero';
import Minting from '../../../components/pages/apis/transaction/minting';
import Metatags from '../../../components/site/metatags';

const TransactionMintingPage: NextPage = () => {
  const sidebarItems = [
    { label: 'Minting assets', to: 'minting' },
    { label: 'Burning assets', to: 'burning' },
  ];

  return (
    <>
      <Metatags
        title="Minting Transactions"
        description="Learn to use ForgeScript to create minting transactions for minting and burning native assets."
      />
      <CommonLayout sidebarItems={sidebarItems}>
        <CommonHero
          title="Minting Transactions"
          desc="Learn to use ForgeScript to create minting transactions for minting and burning native assets."
          icon={<FireIcon className="w-16 h-16" />}
        />
        <Minting />
        <Burning />
      </CommonLayout>
    </>
  );
};

export default TransactionMintingPage;
