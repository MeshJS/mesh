import { ArrowsPointingInIcon } from '@heroicons/react/24/solid';
import type { NextPage } from 'next';
import CommonLayout from '../../../components/common/layout';
import DelegateStake from '../../../components/pages/apis/transaction/delegateStake';
// import CommonHero from '../../../components/pages/apis/transaction/commonHero';
import Metatags from '../../../components/site/metatags';

const TransactionStakingPage: NextPage = () => {
  const sidebarItems = [
    { label: 'Delegate Stake', to: 'delegateStake' },
    { label: 'Withdraw Rewards', to: 'withdrawRewards' },
    { label: 'Register Stake', to: 'registerStake' },
    { label: 'Deregister Stake', to: 'deregisterStake' },
    { label: 'Register Pool', to: 'registerPool' },
    { label: 'Retire Pool', to: 'retirePool' },
  ];

  return (
    <>
      <Metatags
        title="Staking"
        description="APIs for staking ADA and managing stake pools."
      />
      <CommonLayout sidebarItems={sidebarItems}>
        {/* <CommonHero
          title="Staking"
          desc="APIs for staking ADA and managing stake pools."
          icon={<ArrowsPointingInIcon className="w-16 h-16" />}
        /> */}
        <DelegateStake />
      </CommonLayout>
    </>
  );
};

export default TransactionStakingPage;
