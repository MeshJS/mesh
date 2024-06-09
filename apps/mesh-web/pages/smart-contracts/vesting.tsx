import type { NextPage } from 'next';
import ContractsVesting from '../../components/pages/contracts/vesting';
import Metatags from '../../components/site/metatags';

const SmartContractsVesting: NextPage = () => {
  return (
    <>
      <Metatags
        title="Vesting Contract"
        description="A Vesting contract where you can lock assets for a period of time."
      />
      <ContractsVesting />
    </>
  );
};

export default SmartContractsVesting;
