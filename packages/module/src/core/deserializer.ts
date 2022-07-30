import { csl } from './csl';
import { toBytes } from './converter';

const {
  Address, PlutusScript,
  TransactionHash, TransactionUnspentOutput,
} = csl;

export const deserializeAddress = (address: string) => Address
  .from_bytes(toBytes(address));

  export const deserializePlutusScript = (plutusScript: string) => PlutusScript
    .from_bytes(toBytes(plutusScript));

export const deserializeTxHash = (txHash: string) => TransactionHash
  .from_bytes(toBytes(txHash));

export const deserializeTxUnspentOutput = (utxo: string) => TransactionUnspentOutput
  .from_bytes(toBytes(utxo));
