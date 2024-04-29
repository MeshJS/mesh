import type { NextPage } from 'next';
import ContractsMarketplace from '../../components/pages/contracts/marketplace';
import Metatags from '../../components/site/metatags';

const SmartContractsMarketplace: NextPage = () => {
  return (
    <>
      <Metatags
        title="Marketplace Contract"
        description="A marketplace where you can buy and sell NFTs"
      />
      <ContractsMarketplace />
    </>
  );
};

export default SmartContractsMarketplace;
