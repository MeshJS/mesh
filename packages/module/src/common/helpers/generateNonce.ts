import { customAlphabet } from 'nanoid';
import { fromUTF8 } from '@mesh/common/utils';

export const generateNonce = (label = '', length = 32) => {
  if (length <= 0 || length > 2048) {
    throw new Error('Length must be bewteen 1 and 2048');
  }

  const randomString = customAlphabet(
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  );

  const payload = randomString(length);
  return fromUTF8(`${label}${payload}`);
};
