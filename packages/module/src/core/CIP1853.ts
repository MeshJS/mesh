import { HARDENED_KEY_START } from '@mesh/common/constants';
import { deserializeBip32PrivateKey } from '@mesh/common/utils';
import { csl } from './CSL';

export const deriveStakePoolColdKey = (rootKey: string, coldIndex: number) => {
  const bip32PrivateKey = deserializeBip32PrivateKey(rootKey);

  const coldKey: csl.PrivateKey = bip32PrivateKey
    .derive(HARDENED_KEY_START + 1853) // purpose
    .derive(HARDENED_KEY_START + 1815) // coin type
    .derive(HARDENED_KEY_START + 0) // usecase
    .derive(HARDENED_KEY_START + coldIndex)
    .to_raw_key();

  bip32PrivateKey.free();

  return coldKey;
};
