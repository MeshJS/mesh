import ApisLayout from '../common/layout';
import ResolveDataHash from './resolveDataHash';
import Hero from './hero';
import ResolveFingerprint from './resolveFingerprint';
import ResolvePrivateKey from './resolvePrivateKey';

export default function Resolvers() {
  const sidebarItems = [{ label: 'Datum to DataHash', to: 'resolveDataHash' }];

  // resolveDataHash
  // - you give it a Data object it will calculate the hash
  // resolveFingerprint
  // - you give it an Asset object it will calculate the asset fingerprint CIP-5
  // resolvePaymentKeyHash
  // - you give it a bech32 address long aka base address/payment address or short one aka enterprise address it will return the pub key hash of the payment key
  // resolvePrivateKey
  // - you give the 24 words aka mnemonic it will return a bech32 private key
  // resolveScriptAddress
  // - you give it a plutus script cbor hex it will give you the address for it
  // resolveScriptHash
  // - you give it the plutus script address it will give you the script hash
  // resolveStakeAddress
  // - you give it a base address inbech32 format it will return a stake address
  // resolveStakeKeyHash
  // - you give it a bech32 address long aka base address/payment address or short one aka rewards address starts with stake it will return the pub key hash of the stake key
  // resolveTxHash
  // - you give it a cbor transaction it will give you the hash of the transaction

  return (
    <ApisLayout sidebarItems={sidebarItems}>
      <Hero />
      <Main />
    </ApisLayout>
  );
}

function Main() {
  return (
    <>
      <ResolveDataHash />
      <ResolveFingerprint />
      <ResolvePrivateKey />
    </>
  );
}
