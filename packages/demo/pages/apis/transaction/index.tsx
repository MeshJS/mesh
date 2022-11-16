import type { NextPage } from 'next';
import Transaction from '../../../components/pages/apis/transaction';
import Metatags from '../../../components/site/metatags';

const TransactionPage: NextPage = () => {
  return (
    <>
      <Metatags
        title="Transaction"
        description="Create transactions, minting and interacting with smart contracts"
      />
      <Transaction />
    </>
  );
};

export default TransactionPage;
