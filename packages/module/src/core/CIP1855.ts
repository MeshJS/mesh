import { HARDENED_KEY_START } from '@mesh/common/constants';
import { deserializeBip32PrivateKey } from '@mesh/common/utils';

export const deriveForgingPolicyKey = (rootKey: string, policyIndex: number) => {
  const bip32PrivateKey = deserializeBip32PrivateKey(rootKey);

  const policyKey = bip32PrivateKey
    .derive(HARDENED_KEY_START + 1855) // purpose
    .derive(HARDENED_KEY_START + 1815) // coin type
    .derive(HARDENED_KEY_START + policyIndex).to_raw_key();

  bip32PrivateKey.free();

  return policyKey;
};
