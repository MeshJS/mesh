import { bech32 } from "bech32";

import { csl } from "../deser";

export const getDRepIds = (
  dRepId: string,
): {
  cip105: string;
  cip129: string;
} => {
  const cslDrep = csl.DRep.from_bech32(dRepId);
  let result = {
    cip105: cslDrep.to_bech32(false),
    cip129: cslDrep.to_bech32(true),
  };
  return result;
};
