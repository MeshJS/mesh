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

const TransactionBuilderExamplePage: NextPage = () => {
  const sidebarItems = [
    { label: 'Getting Started', to: 'gettingStarted' },
    { label: 'Send values', to: 'sendValues' },
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
          <Link href="/apis/transaction/builder">MeshTxBuilder - All APIs</Link>{' '}
          page.
        </p>
        <GettingStarted />
        <SendValues />
        <ComplexTransaction />
        <TransactionWithoutDependency />
        <TransactionWithObject />
      </CommonLayout>
    </>
  );
};

export default TransactionBuilderExamplePage;
