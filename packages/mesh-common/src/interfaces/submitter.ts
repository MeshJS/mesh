export interface ISubmitter {
  submitTx(tx: string): Promise<string>;
}
