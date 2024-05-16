import type { NextPage } from 'next';
import Metatags from '../../components/site/metatags';
import ContractsGiftcard from '../../components/pages/contracts/giftcard';

const SmartContractsGiftcard: NextPage = () => {
  return (
    <>
      <Metatags
        title="Giftcard Contract"
        description="Send and redeem a gift card."
      />
      <ContractsGiftcard />
    </>
  );
};

export default SmartContractsGiftcard;
