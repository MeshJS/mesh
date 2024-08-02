import { Quantity, Unit, UTxO } from "..";
import { experimentalSelectUtxos } from "./experimental";
import { keepRelevant } from "./keepRelevant";
import { largestFirst } from "./largestFirst";
import { largestFirstMultiAsset } from "./largestFirstMultiAsset";

export {
  keepRelevant,
  largestFirst,
  largestFirstMultiAsset,
  experimentalSelectUtxos,
};

/**
 * All UTxO selection algorithms follows below's interface
 *
 * Supported algorithms:
 * - largestFirst - CIP2 suggested algorithm
 * - largestFirstMultiAsset - CIP2 suggested algorithm
 * - keepRelevant - CIP2 suggested algorithm
 * - experimental - The always evolving algorithm according to the latest research
 *
 * @param requestedOutputSet
 * @param initialUTxOSet
 * @returns
 */
export class UtxoSelection {
  private threshold: Quantity;
  private includeTxFees: boolean;

  constructor(threshold = "5000000", includeTxFees = true) {
    this.threshold = threshold;
    this.includeTxFees = includeTxFees;
  }

  largestFirst(requiredAssets: Map<Unit, Quantity>, inputs: UTxO[]) {
    const lovelaceAmount = requiredAssets.get("lovelace") ?? "0";
    const requiredAssetWithThreshold =
      BigInt(lovelaceAmount) + BigInt(this.threshold);
    return largestFirst(
      requiredAssetWithThreshold.toString(),
      inputs,
      this.includeTxFees,
    );
  }

  keepRelevant(requiredAssets: Map<Unit, Quantity>, inputs: UTxO[]) {
    return keepRelevant(requiredAssets, inputs, this.threshold);
  }

  largestFirstMultiAsset(requiredAssets: Map<Unit, Quantity>, inputs: UTxO[]) {
    const lovelaceAmount = requiredAssets.get("lovelace") ?? "0";
    requiredAssets.set(
      "lovelace",
      (BigInt(lovelaceAmount) + BigInt(this.threshold)).toString(),
    );
    return largestFirstMultiAsset(requiredAssets, inputs, this.includeTxFees);
  }

  experimental(requiredAssets: Map<Unit, Quantity>, inputs: UTxO[]) {
    return experimentalSelectUtxos(requiredAssets, inputs, this.threshold);
  }
}

export type UtxoSelectionStrategy = keyof UtxoSelection;
