export type Address = {
  address: string;
  publicKey?: string;
  purpose: "payment" | "ordinals";
  addressType: "p2tr" | "p2wpkh" | "p2sh";
}