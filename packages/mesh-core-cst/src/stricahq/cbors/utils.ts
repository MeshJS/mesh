/* eslint-disable max-classes-per-file */
import { Buffer } from 'buffer';
import BigNumber from 'bignumber.js';

const MAX_SAFE_HIGH = 0x1fffff;
export const SHIFT32 = 0x100000000;
export const POW_2_24 = 5.960464477539063e-8;
export const POW_2_32 = 4294967296;
export const POW_2_53 = 9007199254740992;
export const MAX_BIG_NUM_INT = new BigNumber('0x20000000000000');
export const MAX_BIG_NUM_INT32 = new BigNumber('0xffffffff');
export const MAX_BIG_NUM_INT64 = new BigNumber('0xffffffffffffffff');

export const getBigNum = (f: number, g: number): number | BigNumber => {
  if (f > MAX_SAFE_HIGH) {
    return new BigNumber(f).times(SHIFT32).plus(g);
  }
  return f * SHIFT32 + g;
};

export const addSpanBytesToObject = (obj: any, span: [number, number]): any => {
  const spanObj = obj;
  spanObj.byteSpan = span;
  spanObj.getByteSpan = function (): [number, number] {
    return this.byteSpan;
  };

  return spanObj;
};

const td = new TextDecoder('utf8', { fatal: true, ignoreBOM: true });
export const utf8Decoder = (buf: Buffer) => td.decode(buf);