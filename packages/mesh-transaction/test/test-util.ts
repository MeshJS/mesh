import {bech32} from 'bech32';

import {applyCborEncoding, resolveScriptHash} from '@meshsdk/core';
import {blake2b, TransactionOutput} from '@meshsdk/core-cst';

export const txHash = (tx: string) => {
  return blake2b(32).update(Buffer.from(tx, 'utf-8')).digest('hex');
};

export const alwaysSucceedCbor = applyCborEncoding(
  '58340101002332259800a518a4d153300249011856616c696461746f722072657475726e65642066616c736500136564004ae715cd01',
);

export const alwaysSucceedHash = resolveScriptHash(alwaysSucceedCbor, 'V3');

export const baseAddress = (index: number) => {
  const numberString = index.toString().padStart(28, '0');
  const numberStringReversed = numberString.split('').reverse().join('');
  const bytes = Buffer.concat([
    Buffer.from([0x00]),
    Buffer.from(numberString, 'utf-8'),
    Buffer.from(numberStringReversed, 'utf-8'),
  ]);
  return encodeBech32Address(bytes);
};

const encodeBech32Address = (bytes: Uint8Array): string => {
  const words = bech32.toWords(bytes);
  return bech32.encode('addr_test', words, 200);
};

export const mockTokenUnit = (num: number) => {
  const policyId = num.toString(16).padStart(56, '0');
  const tokenName = num.toString(16).padStart(8, '0');

  return `${policyId}${tokenName}`;
};

export const calculateMinLovelaceForTransactionOutput = (output: TransactionOutput, coinsPerUtxoSize: bigint): bigint => {
  const txOutSize = BigInt(output.toCbor().length / 2);
  return 160n + (BigInt(txOutSize) * coinsPerUtxoSize);
}
