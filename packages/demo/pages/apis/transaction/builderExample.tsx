import { CubeIcon } from '@heroicons/react/24/solid';
import type { NextPage } from 'next';
import Link from 'next/link';
import CommonLayout from '../../../components/common/layout';
import ComplexTransaction from '../../../components/pages/apis/transaction/builderExample/complexTransaction';
import GettingStarted from '../../../components/pages/apis/transaction/builderExample/gettingStarted';
import SendValues from '../../../components/pages/apis/transaction/builderExample/sendValues';
import TransactionWithObject from '../../../components/pages/apis/transaction/builderExample/withObject';
import TransactionWithoutDependency from '../../../components/pages/apis/transaction/builderExample/withoutDependency';
import CommonHero from '../../../components/pages/apis/transaction/commonHero';
import Metatags from '../../../components/site/metatags';
import LockFund from '../../../components/pages/apis/transaction/builderExample/lockFund';
import UnlockFund from '../../../components/pages/apis/transaction/builderExample/unlockFund';
import MintToken from '../../../components/pages/apis/transaction/builderExample/mintToken';
import Staking from '../../../components/pages/apis/transaction/builderExample/staking';

const TransactionBuilderExamplePage: NextPage = () => {
  const sidebarItems = [
    { label: 'Getting Started', to: 'gettingStarted' },
    { label: 'Send Values', to: 'sendValues' },
    { label: 'Lock Fund', to: 'lockFund' },
    { label: 'Unlock Fund', to: 'unlockFund' },
    { label: 'Mint Tokens', to: 'mintToken' },
    { label: 'Delegate Stake', to: 'staking' },
    { label: 'Complex Transaction', to: 'complexTransaction' },
    { label: 'Build without dependency', to: 'withoutDependency' },
    { label: 'Build with object', to: 'withObject' },
  ];

  return (
    <>
      <Metatags
        title="Craft Customized Transactions"
        description="Build all possible transaction with our cardano-cli like APIs."
      />
      <CommonLayout sidebarItems={sidebarItems}>
        <CommonHero
          title="Craft Customized Transactions"
          desc="Build all possible transaction with our cardano-cli like APIs."
          icon={<CubeIcon className="w-16 h-16" />}
        />
        <p>
          For a complete walkthrough of all available cardano-cli like APIs,
          please refer to the{' '}
          <Link href="/apis/transaction/builder">
            MeshTxBuilder - All API Endpoints
          </Link>{' '}
          page.
        </p>
        <GettingStarted />
        <SendValues />
        <LockFund />
        <UnlockFund />
        <MintToken />
        <Staking />
        <ComplexTransaction />
        <TransactionWithoutDependency />
        <TransactionWithObject />
      </CommonLayout>
    </>
  );
};

export default TransactionBuilderExamplePage;
