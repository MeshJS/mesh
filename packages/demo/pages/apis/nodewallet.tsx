import type { NextPage } from 'next';
import AppWallet from '../../components/pages/apis/AppWallet';
import Metatags from '../../components/site/metatags';

const AppWalletPage: NextPage = () => {
  return (
    <>
      <Metatags
        title="Node Wallet APIs"
        description="Supercharged backend wallet."
      />
      <AppWallet />
    </>
  );
};

export default AppWalletPage;
