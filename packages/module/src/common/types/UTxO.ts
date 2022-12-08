import { Responses } from '@blockfrost/blockfrost-js';
import { Asset } from './Asset';

export type UTxO = {
  input: {
    outputIndex: number;
    txHash: string;
  };
  output: {
    address: string;
    amount: Asset[];
    dataHash?: string;
    plutusData?: string;
    scriptRef?: string;
  };
};

export type BlockfrostUtxos = Responses['address_utxo_content'];
export type BlockfrostEpoch = Responses['epoch_param_content'];