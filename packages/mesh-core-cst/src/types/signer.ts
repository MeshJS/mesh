import { Address } from ".";
import { StricaPrivateKey } from "../";

export type Signer = {
  address: Address;
  key: StricaPrivateKey;
};
