import { csl } from '../../core/cardano';
import { toBytes } from './converter';

export const deserializeAddress = (address: string) => csl.Address
  .from_bytes(toBytes(address));

  export const deserializePlutusScript = (plutusScript: string) => csl.PlutusScript
    .from_bytes(toBytes(plutusScript));

export const deserializeTxHash = (txHash: string) => csl.TransactionHash
  .from_bytes(toBytes(txHash));

export const deserializeTxUnspentOutput = (utxo: string) => csl.TransactionUnspentOutput
  .from_bytes(toBytes(utxo));
