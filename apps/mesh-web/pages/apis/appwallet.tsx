import type { NextPage } from 'next';
import AppWallet from '../../components/pages/apis/appwallet';
import Metatags from '../../components/site/metatags';

const AppWalletPage: NextPage = () => {
  return (
    <>
      <Metatags
        title="App Wallet"
        description="Supercharged wallet for building amazing applications."
      />
      <AppWallet />
    </>
  );
};

export default AppWalletPage;
