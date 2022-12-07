import { PaperAirplaneIcon } from '@heroicons/react/24/solid';
import type { NextPage } from 'next';
import CommonLayout from '../../../components/common/layout';
import CoinSelection from '../../../components/pages/apis/transaction/coinSelection';
import CommonHero from '../../../components/pages/apis/transaction/commonHero';
import SendAda from '../../../components/pages/apis/transaction/sendAda';
import SendAssets from '../../../components/pages/apis/transaction/sendAssets';
import SetTimeLimit from '../../../components/pages/apis/transaction/setTimeLimit';
import Metatags from '../../../components/site/metatags';

const TransactionPage: NextPage = () => {
  const sidebarItems = [
    { label: 'Send ADA to addresses', to: 'sendAda' },
    { label: 'Send multi-assets to addresses', to: 'sendAssets' },
    { label: 'Set time limit', to: 'setTimeLimit' },
    { label: 'Coin Selection', to: 'coinSelection' },
  ];

  return (
    <>
      <Metatags
        title="Transactions"
        description="Create transactions for sending assets."
      />
      <CommonLayout sidebarItems={sidebarItems}>
        <CommonHero
          title="Transactions"
          desc="Create transactions for sending assets."
          icon={<PaperAirplaneIcon className="w-16 h-16" />}
        />
        <SendAda />
        <SendAssets />
        <SetTimeLimit />
        <CoinSelection />
      </CommonLayout>
    </>
  );
};

export default TransactionPage;
