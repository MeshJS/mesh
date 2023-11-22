import { ListBulletIcon } from '@heroicons/react/24/solid';
import type { NextPage } from 'next';
import Link from 'next/link';
import CommonLayout from '../../../components/common/layout';
import InvalidInterval from '../../../components/pages/apis/transaction/builder/InvalidInterval';
import ChangeAddress from '../../../components/pages/apis/transaction/builder/changeAddress';
import Complete from '../../../components/pages/apis/transaction/builder/complete';
import Schemas from '../../../components/pages/apis/transaction/builder/schemas';
import MetadataValue from '../../../components/pages/apis/transaction/builder/metadataValue';
import MintPlutus from '../../../components/pages/apis/transaction/builder/mintPlutus';
import MintNative from '../../../components/pages/apis/transaction/builder/mintNative';
import ReadOnlyTxInReference from '../../../components/pages/apis/transaction/builder/readOnlyTxInReference';
import RequiredSignerHash from '../../../components/pages/apis/transaction/builder/requiredSignerHash';
import SigningKey from '../../../components/pages/apis/transaction/builder/signingKey';
import TxIn from '../../../components/pages/apis/transaction/builder/txIn';
import ScriptTxIn from '../../../components/pages/apis/transaction/builder/scriptTxIn';
import TxInCollateral from '../../../components/pages/apis/transaction/builder/txInCollateral';
import TxOut from '../../../components/pages/apis/transaction/builder/txOut';
import CommonHero from '../../../components/pages/apis/transaction/commonHero';
import Metatags from '../../../components/site/metatags';

const TransactionBuilderPage: NextPage = () => {
  const sidebarItems = [
    { label: 'Set pubkey input', to: 'txIn' },
    { label: 'Set script input', to: 'scriptTxIn' },
    { label: 'Set output', to: 'txOut' },
    {
      label: 'Set reference input',
      to: 'readOnlyTxInReference',
    },
    {
      label: 'Minting a native token',
      to: 'mintNative',
    },
    {
      label: 'Minting a Plutus script token',
      to: 'mintPlutus',
    },
    {
      label: 'Set required signer',
      to: 'requiredSignerHash',
    },
    {
      label: 'Set collateral UTxO',
      to: 'txInCollateral',
    },
    {
      label: 'Set change address',
      to: 'changeAddress',
    },
    {
      label: 'Set validity interval',
      to: 'invalidInterval',
    },
    {
      label: 'Add metadata',
      to: 'metadataValue',
    },
    {
      label: 'Sign with signing key',
      to: 'signingKey',
    },
    {
      label: 'Complete transaction building',
      to: 'complete',
    },
    {
      label: 'Schemas',
      to: 'schemas',
    },
  ];

  return (
    <>
      <Metatags
        title="MeshTxBuilder - All API Endpoints"
        description="A complete walk through on Mesh's lower level APIs."
      />
      <CommonLayout sidebarItems={sidebarItems}>
        <CommonHero
          title="MeshTxBuilder - All API Endpoints"
          desc="Using MeshTxBuilder to build lower level transactions"
          icon={<ListBulletIcon className="w-16 h-16" />}
        />
        <p>
          For examples on how to build all possible transactions with
          MeshTxBuilder, please refer to the{' '}
          <Link href="/apis/transaction/builderExample">
            Craft Customized Transactions
          </Link>{' '}
          page.
        </p>
        <TxIn />
        <ScriptTxIn />
        <TxOut />
        <ReadOnlyTxInReference />
        <MintNative />
        <MintPlutus />
        <RequiredSignerHash />
        <TxInCollateral />
        <ChangeAddress />
        <InvalidInterval />
        <MetadataValue />
        <SigningKey />
        <Complete />
        <Schemas />
      </CommonLayout>
    </>
  );
};

export default TransactionBuilderPage;
