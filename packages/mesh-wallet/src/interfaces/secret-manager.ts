import { HARDENED_OFFSET } from "../utils/constants";
import { ISigner } from "./signer";

export type DerivationPath = number[] | string;

export interface ISecretManager {
  getPublicKey(derivationPath: DerivationPath): Promise<string>;
  getSigner(derivationPath: DerivationPath): Promise<ISigner>;
}

export const derivationPathVectorFromString = (path: string): number[] => {
  if (!/^m?\/\d+(\/\d+)*$/.test(path)) {
    throw new Error(`Invalid derivation path: ${path}`);
  }
  let pathString = path;
  if (pathString.startsWith("m/")) {
    pathString = pathString.slice(2);
  }
  return pathString.split("/").map((part) => {
    if (part.endsWith("'")) {
      return Number.parseInt(part.slice(0, -1)) + HARDENED_OFFSET;
    } else {
      return Number.parseInt(part);
    }
  });
};

export const derivationPathStringFromVector = (path: number[]): string => {
  return path
    .map((part) => {
      if (part >= HARDENED_OFFSET) {
        return part - HARDENED_OFFSET + "'";
      } else {
        return part.toString();
      }
    })
    .join("/");
};
