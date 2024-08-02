import strica from "@stricahq/bip32ed25519"; // This works with broswer, but not node

// import * as strica from "@stricahq/bip32ed25519"; // This works with node, but not browser

// let strica: any;

// if (typeof window !== "undefined") {
//   // Browser environment
//   strica = await import("@stricahq/bip32ed25519");
// } else {
//   // Node.js environment
//   strica = require("@stricahq/bip32ed25519");
// }

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

const { PublicKey, Bip32PrivateKey, Bip32PublicKey } = strica;

export { PrivateKey, PublicKey, Bip32PrivateKey, Bip32PublicKey };
