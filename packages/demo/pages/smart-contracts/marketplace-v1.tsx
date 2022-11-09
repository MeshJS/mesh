import type { NextPage } from 'next';
import ContractsMarketplaceV1 from '../../components/pages/contracts/marketplaceV1';
import Metatags from '../../components/site/metatags';

const SmartContractsMarketplaceV1: NextPage = () => {
  return (
    <>
      <Metatags
        title="Marketplace Contract V1"
        description="A marketplace where you can buy and sell NFTs"
      />
      <ContractsMarketplaceV1 />
    </>
  );
};

export default SmartContractsMarketplaceV1;
