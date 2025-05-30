import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import * as bip39 from "bip39";
import { BIP32Factory } from "bip32";
import { ECPairFactory } from "ecpair";
import { sha256 } from "js-sha256";
import { pbkdf2Sync } from "pbkdf2";
import { HDKey } from "@scure/bip32";
import BN from "bn.js";
import { Psbt } from "bitcoinjs-lib";

const bip32 = BIP32Factory(ecc);
const ECPair = ECPairFactory(ecc);

bitcoin.initEccLib(ecc);

export {
  bitcoin,
  bip32,
  bip39,
  BN,
  ecc,
  ECPair,
  HDKey,
  pbkdf2Sync,
  Psbt,
  sha256,
};
