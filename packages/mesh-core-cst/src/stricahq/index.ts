import strica from "@stricahq/bip32ed25519";
import hash from "hash.js";

import { CoseSign1, getPublicKeyFromCoseKey } from "./coseSign1";

class PrivateKey extends strica.PrivateKey {
  constructor(privKey: Buffer, extended: Boolean = true) {
    if (!extended) {
      let extendedSecret = hash.sha512().update(privKey).digest();
      if (extendedSecret[0] && extendedSecret[31]) {
        extendedSecret[0] &= 0b1111_1000;
        extendedSecret[31] &= 0b0011_1111;
        extendedSecret[31] |= 0b0100_0000;
      }
      privKey = Buffer.from(extendedSecret);
    }
    super(privKey);
  }
}

const { PublicKey, Bip32PrivateKey, Bip32PublicKey } = strica;

export {
  PrivateKey as StricaPrivateKey,
  PublicKey as StricaPublicKey,
  Bip32PrivateKey as StricaBip32PrivateKey,
  Bip32PublicKey as StricaBip32PublicKey,
  CoseSign1 as StricaCoseSign1,
  getPublicKeyFromCoseKey,
};
