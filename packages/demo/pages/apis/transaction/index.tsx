import { PaperAirplaneIcon } from '@heroicons/react/24/solid';
import type { NextPage } from 'next';
import CommonLayout from '../../../components/common/layout';
import SendAdaHandler from '../../../components/pages/apis/transaction/basic/sendAdaHandler';
import TxSetMetadata from '../../../components/pages/apis/transaction/basic/setMetadata';
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
    { label: 'Send Assets to Handler', to: 'sendAdaHandler' },
    { label: 'Set time limit', to: 'setTimeLimit' },
    { label: 'Set metadata', to: 'setMetadata' },
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
        <SendAdaHandler />
        <SetTimeLimit />
        <TxSetMetadata />
        <CoinSelection />
      </CommonLayout>
    </>
  );
};

export default TransactionPage;
