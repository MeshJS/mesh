import { Address } from ".";
import { PrivateKey } from "../stricahq";

export type Signer = {
  address: Address;
  key: PrivateKey;
};
