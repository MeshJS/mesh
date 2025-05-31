import { Network } from "../common";

export interface IBitcoinWallet {
  getChangeAddress(): Promise<string>;
  getNetwork(): Promise<Network>;
  signTx(signedTx: string): Promise<string>;
  submitTx(tx: string): Promise<string>;
}
