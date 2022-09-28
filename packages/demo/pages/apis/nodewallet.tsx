import type { NextPage } from 'next';
import NodeWallet from '../../components/pages/apis/nodewallet';
import Metatags from '../../components/site/metatags';

const NodeWalletPage: NextPage = () => {
  return (
    <>
      <Metatags
        title="Node Wallet APIs"
        description="Supercharged backend wallet."
      />
      <NodeWallet />
    </>
  );
};

export default NodeWalletPage;
