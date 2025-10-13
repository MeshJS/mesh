import { ISigner } from "./signer";

export interface IBip32 {
  derive(path: number[]): Promise<IBip32>;
  getPublicKey(): Promise<string>;
  toSigner(): Promise<ISigner>;
}
