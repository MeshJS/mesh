export interface ISigner {
  signData(address: string, payload: string): Promise<string>;
  signTx(unsignedTx: string, partialSign: boolean): Promise<string>;
}
