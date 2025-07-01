import { bitcoin } from "../core";
import { Address } from "../types";

export function resolveAddress(
  publicKey: string | Buffer,
  network: "mainnet" | "testnet" | bitcoin.networks.Network
): Address {
  const p2wpkh = bitcoin.payments.p2wpkh({
    pubkey:
      typeof publicKey === "string" ? Buffer.from(publicKey, "hex") : publicKey,
    network:
      network === "mainnet"
        ? bitcoin.networks.bitcoin
        : network === "testnet"
          ? bitcoin.networks.testnet
          : network,
  });

  if (!p2wpkh?.address) {
    throw new Error("Address is not initialized.");
  }

  const pubKeyHex = Buffer.isBuffer(publicKey)
    ? publicKey.toString("hex")
    : publicKey;

  return {
    address: p2wpkh.address,
    publicKey: pubKeyHex,
    purpose: "payment",
    addressType: "p2wpkh",
  };
}
