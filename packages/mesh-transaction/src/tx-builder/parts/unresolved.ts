import type {
  NativeScriptSource,
  PlutusScriptSource,
  TxPart,
  Unresolved,
} from "./types";

const scriptReferenceGaps = (
  source: PlutusScriptSource | NativeScriptSource,
): Unresolved[] => {
  if (source.type !== "reference") return [];
  const complete =
    source.scriptHash !== undefined &&
    source.scriptSize !== undefined &&
    (!("version" in source) || source.version !== undefined);
  return complete ? [] : [{ type: "scriptReference", input: source.input }];
};

/**
 * What a part leaves to be filled in before it can be assembled into a transaction. An empty
 * list means the part is complete as it is.
 */
export const unresolved = (part: TxPart): Unresolved[] => {
  switch (part.kind) {
    case "spend": {
      const gaps: Unresolved[] = part.utxo
        ? []
        : [{ type: "utxo", input: part.input }];
      const { witness } = part;
      if (witness.type === "native") {
        gaps.push(...scriptReferenceGaps(witness.script));
      } else if (witness.type === "plutus") {
        gaps.push(...scriptReferenceGaps(witness.script));
        if (!witness.datum) gaps.push({ type: "datum", input: part.input });
        if (!witness.redeemer.exUnits) gaps.push({ type: "exUnits" });
      }
      return gaps;
    }
    case "referenceInput":
    case "collateral":
      return part.utxo ? [] : [{ type: "utxo", input: part.input }];
    case "collateralReturn":
      return part.totalCollateral === undefined
        ? [{ type: "totalCollateral" }]
        : [];
    case "output":
      return part.output.amount.coin === undefined ? [{ type: "minCoin" }] : [];
  }
};
