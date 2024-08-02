import { csl } from "../deser";

export const skeyToPubKeyHash = (skeyHex: string): string => {
  const isHexUnclean = skeyHex.slice(0, 4) === "5820" && skeyHex.length === 68;
  const cleanHex = isHexUnclean ? skeyHex.slice(4) : skeyHex;
  return csl.PrivateKey.from_hex(cleanHex).to_public().hash().to_hex();
};
