import strica from "@stricahq/bip32ed25519";
import hash from "hash.js";

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

export { PrivateKey };
