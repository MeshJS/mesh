import CommonLayout from '../../../common/layout';
import ResolveDataHash from './resolveDataHash';
import Hero from './hero';
import ResolveFingerprint from './resolveFingerprint';
import ResolvePrivateKey from './resolvePrivateKey';
import ResolvePlutusScriptAddress from './resolvePlutusScriptAddress';
import ResolvePlutusScriptHash from './resolvePlutusScriptHash';
import ResolvePaymentKeyHash from './resolvePaymentKeyHash';
import ResolveStakeAddress from './resolveStakeAddress';
import ResolveStakeKeyHash from './resolveStakeKeyHash';
import ResolveTxHash from './resolveTxHash';
import ResolveEpochNo from './resolveEpochNo';
import ResolveSlotNo from './resolveSlotNo';
import ResolveNativeScriptHash from './resolveNativeScriptHash';

export default function Resolvers() {
  const sidebarItems = [
    { label: 'Data Hash', to: 'resolveDataHash' },
    { label: 'Fingerprint', to: 'resolveFingerprint' },
    { label: 'Native Script Hash', to: 'resolveNativeScriptHash' },
    { label: 'Payment Key Hash', to: 'resolvePaymentKeyHash' },
    { label: 'Plutus Script Address', to: 'resolvePlutusScriptAddress' },
    { label: 'Plutus Script Hash', to: 'resolvePlutusScriptHash' },
    { label: 'Private Key', to: 'resolvePrivateKey' },
    { label: 'Stake Address', to: 'resolveStakeAddress' },
    { label: 'Stake Key Hash', to: 'resolveStakeKeyHash' },
    { label: 'Tx Hash', to: 'resolveTxHash' },
    { label: 'Slot Number', to: 'resolveSlotNo' },
    { label: 'Epoch Number', to: 'resolveEpochNo' },
  ];

  return (
    <CommonLayout sidebarItems={sidebarItems}>
      <Hero />
      <Main />
    </CommonLayout>
  );
}

function Main() {
  return (
    <>
      <ResolveDataHash />
      <ResolveFingerprint />
      <ResolveNativeScriptHash />
      <ResolvePaymentKeyHash />
      <ResolvePlutusScriptAddress />
      <ResolvePlutusScriptHash />
      <ResolvePrivateKey />
      <ResolveStakeAddress />
      <ResolveStakeKeyHash />
      <ResolveTxHash />
      <ResolveSlotNo />
      <ResolveEpochNo />
    </>
  );
}
