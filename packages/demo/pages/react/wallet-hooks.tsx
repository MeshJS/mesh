import type { NextPage } from 'next';
import ReactWalletHooks from '../../components/pages/react/walletHooks';
import Metatags from '../../components/site/metatags';

const ReactWalletHooksPage: NextPage = () => {
  return (
    <>
      <Metatags
        title="React Hooks for Wallet"
        description="React hooks for interacting with connected wallet."
      />
      <ReactWalletHooks />
    </>
  );
};

export default ReactWalletHooksPage;
