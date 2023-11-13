import { CubeIcon } from '@heroicons/react/24/solid';
import type { NextPage } from 'next';
import CommonLayout from '../../../components/common/layout';
import InvalidInterval from '../../../components/pages/apis/transaction/builder/InvalidInterval';
import ChangeAddress from '../../../components/pages/apis/transaction/builder/changeAddress';
import CompleteSigning from '../../../components/pages/apis/transaction/builder/completeSigning';
import MetadataValue from '../../../components/pages/apis/transaction/builder/metadataValue';
import Mint from '../../../components/pages/apis/transaction/builder/mint';
import MintPlutusScriptV2 from '../../../components/pages/apis/transaction/builder/mintPlutusScriptV2';
import MintReferenceTxInRedeemerValue from '../../../components/pages/apis/transaction/builder/mintReferenceTxInRedeemerValue';
import MintTxInReference from '../../../components/pages/apis/transaction/builder/mintTxInReference';
import MintingScript from '../../../components/pages/apis/transaction/builder/mintingScript';
import ReadOnlyTxInReference from '../../../components/pages/apis/transaction/builder/readOnlyTxInReference';
import RequiredSignerHash from '../../../components/pages/apis/transaction/builder/requiredSignerHash';
import SigningKey from '../../../components/pages/apis/transaction/builder/signingKey';
import SpendingPlutusScriptV2 from '../../../components/pages/apis/transaction/builder/spendingPlutusScriptV2';
import SpendingReferenceTxInRedeemerValue from '../../../components/pages/apis/transaction/builder/spendingReferenceTxInRedeemerValue';
import SpendingTxInReference from '../../../components/pages/apis/transaction/builder/spendingTxInReference';
import TxIn from '../../../components/pages/apis/transaction/builder/txIn';
import TxInCollateral from '../../../components/pages/apis/transaction/builder/txInCollateral';
import TxInDatumValue from '../../../components/pages/apis/transaction/builder/txInDatumValue';
import TxInInlineDatumPresent from '../../../components/pages/apis/transaction/builder/txInInlineDatumPresent';
import TxOut from '../../../components/pages/apis/transaction/builder/txOut';
import TxOutDatumValue from '../../../components/pages/apis/transaction/builder/txOutDatumValue';
import TxOutInlineDatumValue from '../../../components/pages/apis/transaction/builder/txOutInlineDatumValue';
import TxOutReferenceScript from '../../../components/pages/apis/transaction/builder/txOutReferenceScript';
import CommonHero from '../../../components/pages/apis/transaction/commonHero';
import Metatags from '../../../components/site/metatags';

const TransactionBuilderPage: NextPage = () => {
  const sidebarItems = [
    { label: 'Set input', to: 'txIn' },
    { label: 'Set input datum', to: 'txInDatumValue' },
    {
      label: 'Set input inline datum',
      to: 'txInInlineDatumPresent',
    },
    { label: 'Set output', to: 'txOut' },
    { label: 'Set output datum', to: 'txOutDatumValue' },
    { label: 'Set output inline datum', to: 'txOutInlineDatumValue' },
    { label: 'Set reference script', to: 'txOutReferenceScript' },
    { label: 'Use V2 Plutus spending scripts', to: 'spendingPlutusScriptV2' },
    {
      label: 'Set reference input in transaction',
      to: 'spendingTxInReference',
    },
    // {
    //   label: 'Set input inline datumn',
    //   to: 'spendingReferenceTxInInlineDatumPresent',
    // },
    {
      label: 'Set redeemer',
      to: 'spendingReferenceTxInRedeemerValue',
    },
    {
      label: 'Specify read only reference',
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
      label: 'Complete signing',
      to: 'completeSigning',
    },
  ];

  return (
    <>
      <Metatags
        title="MeshTxBuilder"
        description="Using MeshTxBuilder for building lower level transactions."
      />
      <CommonLayout sidebarItems={sidebarItems}>
        <CommonHero
          title="MeshTxBuilder"
          desc="APIs for building lower level transactions."
          icon={<CubeIcon className="w-16 h-16" />}
        />
        <TxIn />
        <TxInDatumValue />
        <TxInInlineDatumPresent />
        <TxOut />
        <TxOutDatumValue />
        <TxOutInlineDatumValue />
        <TxOutReferenceScript />
        <SpendingPlutusScriptV2 />
        <SpendingTxInReference />
        <SpendingReferenceTxInRedeemerValue />
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
        <CompleteSigning />
      </CommonLayout>
    </>
  );
};

export default TransactionBuilderPage;
