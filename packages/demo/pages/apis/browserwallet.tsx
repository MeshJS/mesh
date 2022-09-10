import type { NextPage } from 'next';
import BrowserWallet from '../../components/pages/apis/browserwallet';
import Metatags from '../../components/site/metatags';

const BrowserWalletPage: NextPage = () => {
  return (
    <>
      <Metatags
        title="Wallet APIs"
        description="Connecting, queries and performs wallet functions in accordance to CIP30"
      />
      <BrowserWallet />
    </>
  );
};

export default BrowserWalletPage;
