import type { NextPage } from 'next';
import Metatags from '../../components/site/metatags';
import MeshWallet from '../../components/pages/apis/meshwallet';

const MeshWalletPage: NextPage = () => {
  return (
    <>
      <Metatags
        title="Mesh Wallet"
        description="Connecting, queries and performs wallet functions in accordance to CIP30"
      />
      <MeshWallet />
    </>
  );
};

export default MeshWalletPage;
