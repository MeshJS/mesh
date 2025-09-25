import { ISigner } from "./signer";

export interface IBip32 {
  derive(path: number[]): IBip32;
  getPublicKey(): string;
  toSigner(): ISigner;
}
