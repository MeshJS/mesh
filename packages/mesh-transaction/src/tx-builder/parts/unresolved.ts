import type {
  KeyWitness,
  LinkedPart,
  NativeScriptSource,
  NativeWitness,
  PlutusScriptSource,
  PlutusWitness,
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

const witnessGaps = (
  witness: KeyWitness | NativeWitness | PlutusWitness,
): Unresolved[] => {
  if (witness.type === "key") return [];
  const gaps = scriptReferenceGaps(witness.script);
  if (witness.type === "plutus" && !witness.redeemer.exUnits)
    gaps.push({ type: "exUnits" });
  return gaps;
};

/** Whether a part holds a link to an earlier step in place of its input */
export const isLinkedPart = (part: TxPart | LinkedPart): part is LinkedPart =>
  "link" in part;

/**
 * What a part leaves to be filled in before it can be assembled into a transaction. An empty
 * list means the part is complete as it is. A part linked to an earlier step has the gap
 * `link`, and of its witness the gaps that do not depend on the output: what the output holds,
 * its datum among it, is known once the plan that builds the step fills the link in.
 */
export const unresolved = (part: TxPart | LinkedPart): Unresolved[] => {
  if (isLinkedPart(part)) {
    const gaps: Unresolved[] = [{ type: "link", link: part.link }];
    if (part.kind === "spend") gaps.push(...witnessGaps(part.witness));
    return gaps;
  }
  switch (part.kind) {
    case "spend": {
      const gaps: Unresolved[] = part.utxo
        ? []
        : [{ type: "utxo", input: part.input }];
      const { witness } = part;
      if (witness.type === "key") return gaps;
      gaps.push(...scriptReferenceGaps(witness.script));
      if (witness.type === "plutus") {
        if (!witness.datum) gaps.push({ type: "datum", input: part.input });
        if (!witness.redeemer.exUnits) gaps.push({ type: "exUnits" });
      }
      return gaps;
    }
    case "referenceInput":
      // Only the out ref goes into the body: a read output assembles without its contents
      return [];
    case "collateral":
      return part.utxo ? [] : [{ type: "utxo", input: part.input }];
    case "collateralReturn":
      return part.totalCollateral === undefined
        ? [{ type: "totalCollateral" }]
        : [];
    case "output":
      return part.output.amount.coin === undefined ? [{ type: "minCoin" }] : [];
    case "mint":
      return witnessGaps(part.witness);
    case "withdrawal": {
      const { rewardAddress } = part;
      return [
        // A script's own reward address, derived on the build's network
        ...(rewardAddress === undefined
          ? [{ type: "rewardAddress" as const }]
          : []),
        ...(part.amount === undefined
          ? [
              {
                type: "rewardBalance" as const,
                ...(rewardAddress !== undefined && { rewardAddress }),
              },
            ]
          : []),
        ...witnessGaps(part.witness),
      ];
    }
    case "certificate":
      return [
        ...(part.depositParameter
          ? [{ type: "deposit" as const, parameter: part.depositParameter }]
          : []),
        ...(part.witness.type === "none" ? [] : witnessGaps(part.witness)),
      ];
    case "vote":
      return witnessGaps(part.witness);
    case "proposal":
      return [
        ...(part.depositParameter
          ? [{ type: "deposit" as const, parameter: part.depositParameter }]
          : []),
        ...(part.witness.type === "none" ? [] : witnessGaps(part.witness)),
      ];
    case "validity":
      return part.from !== undefined || part.until !== undefined
        ? [{ type: "slot" }]
        : [];
    case "guard":
    case "metadata":
    case "auxiliaryScript":
    case "donation":
    case "treasuryValue":
    case "networkId":
      return [];
  }
};
