import type { NextPage } from 'next';
import Metatags from '../../components/site/metatags';
import ContractsPaymentSplitter from '../../components/pages/contracts/payment-splitter';

const SmartContractsPaymentSplitter: NextPage = () => {
  return (
    <>
      <Metatags
        title="Payment Splitter"
        description="Split contract payouts equally among all payees"
      />
      <ContractsPaymentSplitter />
    </>
  );
};

export default SmartContractsPaymentSplitter;
