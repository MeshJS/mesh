export interface ISigner {
  signData(address: string, payload: string): Promise<{ signature: string; key: string }>;
  signTx(unsignedTx: string, partialSign: boolean): Promise<string>;
}
