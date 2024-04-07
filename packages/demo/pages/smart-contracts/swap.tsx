import type { NextPage } from 'next';
import Metatags from '../../components/site/metatags';
import ContractsSwap from '../../components/pages/contracts/swap';

const SmartContractsSwap: NextPage = () => {
  return (
    <>
      <Metatags
        title="Swap Contract"
        description="?"
      />
      <ContractsSwap />
    </>
  );
};

export default SmartContractsSwap;
