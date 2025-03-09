import { Address } from ".";
import { Ed25519PrivateKey } from "./";

export type Signer = {
  address: Address;
  key: Ed25519PrivateKey;
};
