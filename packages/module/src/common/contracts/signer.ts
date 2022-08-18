export interface ISigner {
  signData(payload: string): Promise<string>;
  signTx(unsignedTx: string, partialSign: boolean): Promise<string>;
}
