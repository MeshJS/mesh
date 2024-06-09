import type { NextPage } from 'next';
import Metatags from '../../components/site/metatags';
import ContractsCouponBondGuaranteed from '../../components/pages/contracts/coupon-bond-guaranteed';

const SmartContractsCouponBondGuaranteed: NextPage = () => {
  return (
    <>
      <Metatags
        title="Coupon Bond Guaranteed Contract"
        description="Debt agreement between Lender and Borrower"
      />
      <ContractsCouponBondGuaranteed />
    </>
  );
};

export default SmartContractsCouponBondGuaranteed;
