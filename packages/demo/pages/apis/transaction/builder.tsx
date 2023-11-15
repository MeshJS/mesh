import { ListBulletIcon } from '@heroicons/react/24/solid';
import type { NextPage } from 'next';
import Link from 'next/link';
import CommonLayout from '../../../components/common/layout';
import InvalidInterval from '../../../components/pages/apis/transaction/builder/InvalidInterval';
import ChangeAddress from '../../../components/pages/apis/transaction/builder/changeAddress';
import Complete from '../../../components/pages/apis/transaction/builder/complete';
import MetadataValue from '../../../components/pages/apis/transaction/builder/metadataValue';
import Mint from '../../../components/pages/apis/transaction/builder/mint';
import MintPlutusScriptV2 from '../../../components/pages/apis/transaction/builder/mintPlutusScriptV2';
import MintReferenceTxInRedeemerValue from '../../../components/pages/apis/transaction/builder/mintReferenceTxInRedeemerValue';
import MintTxInReference from '../../../components/pages/apis/transaction/builder/mintTxInReference';
import MintingScript from '../../../components/pages/apis/transaction/builder/mintingScript';
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
      label: 'Use V2 Plutus minting scripts',
      to: 'mintPlutusScriptV2',
    },
    {
      label: 'Set minting value',
      to: 'mint',
    },
    {
      label: 'Set minting script',
      to: 'mintingScript',
    },
    {
      label: 'Set minting reference',
      to: 'mintTxInReference',
    },
    {
      label: 'Set minting redeemer',
      to: 'mintReferenceTxInRedeemerValue',
    },
    // {
    //   label: 'Set minting redeemer',
    //   to: 'mintRedeemerValue',
    // },
    {
      label: 'Set required signer',
      to: 'requiredSignerHash',
    },
    {
      label: 'Set collateral UTxO',
      to: 'txInCollateral',
    },
    {
      label: 'Accept change UTxO',
      to: 'changeAddress',
    },
    {
      label: 'Set invalid interval',
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
      label: 'Complete',
      to: 'complete',
    },
  ];

  return (
    <>
      <Metatags
        title="MeshTxBuilder - All APIs"
        description="A complete walk through on Mesh's lower level APIs."
      />
      <CommonLayout sidebarItems={sidebarItems}>
        <CommonHero
          title="MeshTxBuilder - All APIs"
          desc="Using MeshTxBuilder for building lower level transactions."
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
        <MintPlutusScriptV2 />
        <Mint />
        <MintingScript />
        <MintTxInReference />
        <MintReferenceTxInRedeemerValue />
        <RequiredSignerHash />
        <TxInCollateral />
        <ChangeAddress />
        <InvalidInterval />
        <MetadataValue />
        <SigningKey />
        <Complete />
      </CommonLayout>
    </>
  );
};

export default TransactionBuilderPage;
