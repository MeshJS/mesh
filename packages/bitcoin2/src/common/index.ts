export * from './address';
export * from './keyDerivation';
export * from './network';
export * from './info';
export * from './taproot';
export * from './constants';
export * from './transaction';

export const toUint8Array = (input: string): Uint8Array => new Uint8Array(Buffer.from(input, 'utf-8'));
