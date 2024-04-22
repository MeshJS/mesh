import CommonLayout from '../../../common/layout';
import GiftcardCreate from './createGiftCard';
import Hero from './hero';
import GiftcardRedeem from './redeemGiftCard';

export default function ContractsGiftcard() {
  const sidebarItems = [
    { label: 'Create Giftcard', to: 'createGiftCard' },
    { label: 'Redeem Giftcard', to: 'redeemGiftCard' },
  ];

  return (
    <CommonLayout sidebarItems={sidebarItems}>
      <Hero />
      <Main />
    </CommonLayout>
  );
}

function Main() {
  return (
    <>
      <GiftcardCreate />
      <GiftcardRedeem />
    </>
  );
}
