import {
  bip32ed25519,
  StricaBip32PrivateKey,
  StricaBip32PrivateKey as StricaBip32PrivateKeyType,
  StricaBip32PublicKey,
  StricaBip32PublicKey as StricaBip32PublicKeyType,
  StricaPrivateKey,
  StricaPrivateKey as StricaPrivateKeyType,
  StricaPublicKey,
  StricaPublicKey as StricaPublicKeyType,
} from "./wrapper";

export default bip32ed25519;
export {
  StricaPrivateKey,
  StricaPublicKey,
  StricaBip32PrivateKey,
  StricaBip32PublicKey,
  StricaPrivateKeyType,
  StricaPublicKeyType,
  StricaBip32PrivateKeyType,
  StricaBip32PublicKeyType,
};
