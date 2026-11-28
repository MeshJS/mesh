import { DataSignature } from "../types";

export interface ISigner {
  signData(payload: string, address?: string): Promise<DataSignature>;
  signTx(
    unsignedTx: string,
    partialSign?: boolean,
    returnFullTx?: boolean,
  ): Promise<string>;
  signTxs(unsignedTxs: string[], partialSign?: boolean): Promise<string[]>;
  /**
   * This signer's vkey witnesses as a CBOR witness set, never the transaction; `"a0"` when it
   * signed nothing. With `keyHashes` it signs only with those of its keys whose hashes the list
   * names, and with no other.
   */
  signTxWitnesses?(tx: string, keyHashes?: readonly string[]): Promise<string>;
}
