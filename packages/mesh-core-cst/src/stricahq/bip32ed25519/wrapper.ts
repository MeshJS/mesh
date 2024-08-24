import * as cjsBip32ed25519 from "@stricahq/bip32ed25519";

export const bip32ed25519: typeof cjsBip32ed25519 & {
  default?: typeof cjsBip32ed25519;
} = cjsBip32ed25519;
const exportedBip32ed25519 = bip32ed25519?.default || bip32ed25519;

export type StricaPrivateKey = cjsBip32ed25519.PrivateKey;
export type StricaPublicKey = cjsBip32ed25519.PublicKey;
export type StricaBip32PrivateKey = cjsBip32ed25519.Bip32PrivateKey;
export type StricaBip32PublicKey = cjsBip32ed25519.Bip32PublicKey;

export const StricaPrivateKey = exportedBip32ed25519.PrivateKey;
export const StricaPublicKey = exportedBip32ed25519.PublicKey;
export const StricaBip32PrivateKey = exportedBip32ed25519.Bip32PrivateKey;
export const StricaBip32PublicKey = exportedBip32ed25519.Bip32PublicKey;
