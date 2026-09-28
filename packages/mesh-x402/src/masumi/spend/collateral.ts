import { UTxO } from "@meshsdk/common";

import { LOVELACE } from "../../types/asset";
import { X402Error } from "../../types/errors";

const MIN_COLLATERAL_LOVELACE = 5_000_000n;

/** Picks a plain (lovelace-only) UTxO with enough ADA to serve as Plutus-spend collateral. */
export const selectCollateralUtxo = (utxos: UTxO[]): UTxO => {
  const candidate = utxos.find(
    (u) =>
      u.output.amount.length === 1 &&
      u.output.amount[0]!.unit === LOVELACE &&
      BigInt(u.output.amount[0]!.quantity) >= MIN_COLLATERAL_LOVELACE,
  );
  if (!candidate) {
    throw new X402Error(
      "INSUFFICIENT_UTXOS",
      `No lovelace-only UTxO with >= ${MIN_COLLATERAL_LOVELACE} lovelace available for collateral`,
    );
  }
  return candidate;
};
