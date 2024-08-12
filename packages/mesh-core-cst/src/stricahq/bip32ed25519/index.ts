import * as strica from "@stricahq/bip32ed25519";

import { PrivateKey } from "./privateKey";

const { PublicKey, Bip32PrivateKey, Bip32PublicKey } = strica;

export {
  PrivateKey as StricaPrivateKey,
  PublicKey as StricaPublicKey,
  Bip32PrivateKey as StricaBip32PrivateKey,
  Bip32PublicKey as StricaBip32PublicKey,
};
