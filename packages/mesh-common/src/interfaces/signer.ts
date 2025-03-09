import { DataSignature } from "../types";

export interface ISigner {
  signData(payload: string, address?: string): Promise<DataSignature>;
  signTx(unsignedTx: string, partialSign?: boolean): Promise<string>;
  signTxs(unsignedTxs: string[], partialSign?: boolean): Promise<string[]>;
}
