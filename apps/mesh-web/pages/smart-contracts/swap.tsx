import type { NextPage } from 'next';
import Metatags from '../../components/site/metatags';
import ContractsSwap from '../../components/pages/contracts/swap';

const SmartSwap: NextPage = () => {
  return (
    <>
      <Metatags
        title="Swap Contract"
        description="Swap contract facilitates the exchange of assets between two parties."
      />
      <ContractsSwap />
    </>
  );
};

export default SmartSwap;
