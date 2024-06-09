import type { NextPage } from 'next';
import ContractsEscrow from '../../components/pages/contracts/escrow';
import Metatags from '../../components/site/metatags';

const SmartContractsEscrow: NextPage = () => {
  return (
    <>
      <Metatags
        title="Escrow Contract"
        description="Facilitate secure peer to peer transactions."
      />
      <ContractsEscrow />
    </>
  );
};

export default SmartContractsEscrow;
