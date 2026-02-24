import { Output, TxIn, TxOutput, UTxO } from "@meshsdk/common";

import {
  BuilderCallbacks,
  IInputSelector,
  ImplicitValue,
  TransactionPrototype,
} from "./coin-selection-interface";

const MAX_U64 = 18446744073709551615n;

// Value utilities
type Value = Map<string, bigint>;
type SelectionPhase = "coverage" | "magnitude" | "final";

/**
 * Error thrown when coin selection fails at a specific phase.
 * Provides detailed information about what was missing and what was available.
 */
export class CoinSelectionError extends Error {
  public readonly phase: SelectionPhase;
  public readonly deficit: Value;
  public readonly availableUtxos: UTxO[];
  public readonly selectedUtxos: UTxO[];

  constructor(
    phase: SelectionPhase,
    deficit: Value,
    availableUtxos: UTxO[],
    selectedUtxos: UTxO[],
  ) {
    const deficitSummary = Array.from(deficit.entries())
      .filter(([_, qty]) => qty > 0n)
      .map(([unit, qty]) => `${unit}: ${qty}`)
      .join(", ");

    super(
      `Coin selection failed at ${phase} phase. ` +
        `Deficit: {${deficitSummary || "none"}}. ` +
        `Available UTxOs: ${availableUtxos.length}, Selected: ${selectedUtxos.length}.`,
    );

    this.name = "CoinSelectionError";
    this.phase = phase;
    this.deficit = deficit;
    this.availableUtxos = availableUtxos;
    this.selectedUtxos = selectedUtxos;
  }
}

// ============================================================================
// Value Utility Functions
// ============================================================================

const mergeValue = (a: Value, b: Value): Value => {
  const merged: Value = new Map(a);
  b.forEach((quantity, unit) => {
    if (merged.has(unit)) {
      const mergedQuantity = merged.get(unit)! + quantity;
      if (mergedQuantity === 0n) {
        merged.delete(unit);
      } else {
        merged.set(unit, mergedQuantity);
      }
    } else {
      merged.set(unit, quantity);
    }
  });
  return merged;
};

const subValue = (a: Value, b: Value): Value => {
  const subtracted: Value = new Map(a);
  b.forEach((quantity, unit) => {
    if (subtracted.has(unit)) {
      const subtractedQuantity = subtracted.get(unit)! - quantity;
      if (subtractedQuantity === 0n) {
        subtracted.delete(unit);
      } else {
        subtracted.set(unit, subtractedQuantity);
      }
    } else {
      subtracted.set(unit, -quantity);
    }
  });
  return subtracted;
};

const valueAllPositive = (value: Value): boolean => {
  return Array.from(value.values()).every((v) => v >= 0n);
};

const assetsToValue = (assets: { unit: string; quantity: string }[]): Value => {
  const value: Value = new Map();
  assets.forEach((asset) => {
    const { unit, quantity } = asset;
    if (value.has(unit)) {
      value.set(unit, value.get(unit)! + BigInt(quantity));
    } else {
      value.set(unit, BigInt(quantity));
    }
  });
  return value;
};

const outputToValue = (output: Output): Value => {
  const value: Value = new Map();
  const amount = output.amount;
  amount.forEach((asset) => {
    const { unit, quantity } = asset;
    if (value.has(unit)) {
      value.set(unit, value.get(unit)! + BigInt(quantity));
    } else {
      value.set(unit, BigInt(quantity));
    }
  });
  return value;
};

const txInToValue = (input: TxIn): Value => {
  const amount = input.txIn.amount;
  if (!amount) {
    throw new Error(
      `UTxO amount info is missing for ${input.txIn.txHash}#${input.txIn.txIndex}`,
    );
  }
  return assetsToValue(amount);
};

const implicitValueToValue = (implicitValue: ImplicitValue): Value => {
  let value: Value = new Map();
  value.set("lovelace", 0n);
  value.set(
    "lovelace",
    value.get("lovelace")! + BigInt(implicitValue.withdrawals),
  );

  value.set("lovelace", value.get("lovelace")! - BigInt(implicitValue.deposit));

  value = mergeValue(value, assetsToValue(implicitValue.mint));

  value.set(
    "lovelace",
    value.get("lovelace")! + BigInt(implicitValue.reclaimDeposit),
  );
  return value;
};

const computeNetImplicitSelectionValues = (
  preselectedUtxos: TxIn[],
  outputs: Output[],
  implicitValue: ImplicitValue,
): Value => {
  let outputValueMap: Value = new Map();
  outputs.forEach((output) => {
    outputValueMap = mergeValue(outputValueMap, outputToValue(output));
  });

  const implicitValueMap = implicitValueToValue(implicitValue);

  let inputValueMap: Value = new Map();
  preselectedUtxos.forEach((input) => {
    inputValueMap = mergeValue(inputValueMap, txInToValue(input));
  });

  let requiredValue: Value = new Map();
  requiredValue = mergeValue(requiredValue, outputValueMap);
  requiredValue = subValue(requiredValue, inputValueMap);
  requiredValue = subValue(requiredValue, implicitValueMap);

  return requiredValue;
};

// ============================================================================
// Coverage-First Helper Functions
// ============================================================================

/**
 * Count distinct asset types with positive quantity in a Value.
 */
const countAssetTypes = (value: Value): number => {
  let count = 0;
  value.forEach((qty) => {
    if (qty > 0n) count++;
  });
  return count;
};

/**
 * Filter to only positive quantities (the deficit).
 */
const filterPositives = (value: Value): Value => {
  const result: Value = new Map();
  value.forEach((qty, unit) => {
    if (qty > 0n) {
      result.set(unit, qty);
    }
  });
  return result;
};

/**
 * Count overlapping assets between two Values (both must have positive quantity).
 */
const countIntersection = (a: Value, b: Value): number => {
  let count = 0;
  a.forEach((qty, unit) => {
    if (qty > 0n && b.has(unit) && b.get(unit)! > 0n) {
      count++;
    }
  });
  return count;
};

/**
 * Check if Value has no positive quantities (deficit is satisfied).
 */
const isDeficitSatisfied = (value: Value): boolean => {
  return Array.from(value.values()).every((v) => v <= 0n);
};

/**
 * Get first asset unit with positive quantity.
 */
const getFirstPositiveAsset = (value: Value): string | undefined => {
  for (const [unit, qty] of value.entries()) {
    if (qty > 0n) return unit;
  }
  return undefined;
};

// ============================================================================
// Phase Result Type
// ============================================================================

interface PhaseResult {
  selectedUtxos: UTxO[];
  remainingUtxos: UTxO[];
  accumulatedValue: Value;
}

// ============================================================================
// CoverageFirstSelector Implementation
// ============================================================================

/**
 * CoverageFirstSelector implements a two-phase coin selection algorithm.
 *
 * Phase 1 (Coverage): Maximizes asset type coverage by selecting UTxOs that
 * reduce the number of distinct asset types still needed. Uses a rating formula:
 *   rating = (typesReduced) + (intersection / 10)
 *
 * Phase 2 (Magnitude): Once coverage is optimized (≤1 asset type remaining),
 * selects UTxOs by magnitude - picking the UTxO with the maximum quantity
 * of the target asset.
 *
 * This approach typically results in fewer UTxOs selected compared to
 * largest-first when dealing with multi-asset transactions.
 */
export class CoverageFirstSelector implements IInputSelector {
  private readonly maxIterations: number;

  constructor(options?: { maxIterations?: number }) {
    this.maxIterations = options?.maxIterations ?? 30;
  }

  /**
   * Phase 1: Coverage Phase
   * Select UTxOs that maximize asset type coverage reduction.
   */
  private coveragePhase(available: UTxO[], deficit: Value): PhaseResult {
    const selectedUtxos: UTxO[] = [];
    let remainingUtxos = [...available];
    let accumulatedValue: Value = new Map();

    for (let i = 0; i < this.maxIterations; i++) {
      // Calculate current deficit
      const currentDeficit = filterPositives(subValue(deficit, accumulatedValue));
      const assetTypesNeeded = countAssetTypes(currentDeficit);

      // Exit coverage phase when ≤1 asset type remains
      if (assetTypesNeeded <= 1) {
        break;
      }

      // Find UTxO with best rating
      let bestUtxo: UTxO | null = null;
      let bestRating = -Infinity;
      let bestIndex = -1;

      for (let j = 0; j < remainingUtxos.length; j++) {
        const utxo = remainingUtxos[j]!;
        const utxoValue = assetsToValue(utxo.output.amount);

        // Calculate what deficit would look like after adding this UTxO
        const newAccumulated = mergeValue(accumulatedValue, utxoValue);
        const newDeficit = filterPositives(subValue(deficit, newAccumulated));
        const newAssetTypes = countAssetTypes(newDeficit);

        // Rating: how many asset types we reduce + intersection bonus
        const typesReduced = assetTypesNeeded - newAssetTypes;
        const intersection = countIntersection(currentDeficit, utxoValue);
        const rating = typesReduced + intersection / 10;

        if (rating > bestRating) {
          bestRating = rating;
          bestUtxo = utxo;
          bestIndex = j;
        }
      }

      // If no UTxO improves our situation, throw error
      if (bestUtxo === null || bestRating <= 0) {
        throw new CoinSelectionError(
          "coverage",
          currentDeficit,
          remainingUtxos,
          selectedUtxos,
        );
      }

      // Select the best UTxO
      selectedUtxos.push(bestUtxo);
      remainingUtxos.splice(bestIndex, 1);
      accumulatedValue = mergeValue(
        accumulatedValue,
        assetsToValue(bestUtxo.output.amount),
      );
    }

    return { selectedUtxos, remainingUtxos, accumulatedValue };
  }

  /**
   * Phase 2: Magnitude Phase
   * Select UTxOs by magnitude for remaining deficit.
   */
  private magnitudePhase(
    available: UTxO[],
    deficit: Value,
    initialAccumulated: Value,
    initialSelected: UTxO[],
  ): PhaseResult {
    const selectedUtxos = [...initialSelected];
    let remainingUtxos = [...available];
    let accumulatedValue = new Map(initialAccumulated);

    for (let i = 0; i < this.maxIterations; i++) {
      // Calculate current deficit
      const currentDeficit = filterPositives(subValue(deficit, accumulatedValue));

      // Exit when deficit is satisfied
      if (isDeficitSatisfied(currentDeficit)) {
        break;
      }

      // Pick first positive asset as target
      const targetAsset = getFirstPositiveAsset(currentDeficit);
      if (!targetAsset) {
        break;
      }

      // Find UTxO with maximum of target asset
      let bestUtxo: UTxO | null = null;
      let bestAmount = 0n;
      let bestIndex = -1;

      for (let j = 0; j < remainingUtxos.length; j++) {
        const utxo = remainingUtxos[j]!;
        const utxoValue = assetsToValue(utxo.output.amount);
        const amount = utxoValue.get(targetAsset) ?? 0n;

        if (amount > bestAmount) {
          bestAmount = amount;
          bestUtxo = utxo;
          bestIndex = j;
        }
      }

      // If no UTxO has the target asset, throw error
      if (bestUtxo === null || bestAmount === 0n) {
        throw new CoinSelectionError(
          "magnitude",
          currentDeficit,
          remainingUtxos,
          selectedUtxos,
        );
      }

      // Select the best UTxO
      selectedUtxos.push(bestUtxo);
      remainingUtxos.splice(bestIndex, 1);
      accumulatedValue = mergeValue(
        accumulatedValue,
        assetsToValue(bestUtxo.output.amount),
      );
    }

    return { selectedUtxos, remainingUtxos, accumulatedValue };
  }

  /**
   * Compute change outputs, splitting if token bundle exceeds size limit.
   */
  private computeChangeOutputs(
    remainingValue: Value,
    changeAddress: string,
    constraints: BuilderCallbacks,
  ): { changeOutputs: TxOutput[]; valueFulfilled: boolean } {
    let lovelaceAvailable = remainingValue.get("lovelace") || 0n;
    let valueFulfilled = true;
    const valueAssets = remainingValue
      .entries()
      .filter(([_, quantity]) => quantity > 0n)
      .map(([unit, quantity]) => ({
        unit,
        quantity: String(quantity),
      }))
      .toArray();
    const changeOutputs: TxOutput[] = [];
    let currentBundle: { unit: string; quantity: string }[] = [
      {
        unit: "lovelace",
        quantity: String(0),
      },
    ];
    if (constraints.tokenBundleSizeExceedsLimit(valueAssets)) {
      // if the value assets exceed the token bundle size limit,
      // we need to split them into multiple change outputs
      const tokenAssets = valueAssets.filter(
        (asset) => asset.unit !== "lovelace",
      );
      for (const tokenAsset of tokenAssets) {
        currentBundle.push(tokenAsset);
        if (constraints.tokenBundleSizeExceedsLimit(currentBundle)) {
          const currentToken = currentBundle.pop();
          const minUtxo = constraints.computeMinimumCoinQuantity({
            address: changeAddress,
            amount: currentBundle,
          });
          // lovelace value should be guaranteed to be the first element
          currentBundle[0]!.quantity = minUtxo.toString();
          changeOutputs.push({
            address: changeAddress,
            amount: currentBundle,
          });
          currentBundle = [
            {
              unit: "lovelace",
              quantity: String(0),
            },
            currentToken!,
          ];
          lovelaceAvailable -= minUtxo;
        }
      }
      // Handle final token bundle
      if (currentBundle.length > 0) {
        const minUtxo = constraints.computeMinimumCoinQuantity({
          address: changeAddress,
          amount: currentBundle,
        });
        currentBundle[0]!.quantity = minUtxo.toString();
        changeOutputs.push({
          address: changeAddress,
          amount: currentBundle,
        });
        lovelaceAvailable -= minUtxo;
      }

      // If there is lovelace remaining, just put it in the last output
      if (lovelaceAvailable > 0n) {
        const finalOutput = changeOutputs[changeOutputs.length - 1]!;
        const finalOutputLovelaces = finalOutput.amount.find(
          (asset) => asset.unit === "lovelace",
        );
        if (finalOutputLovelaces) {
          finalOutputLovelaces.quantity = String(
            BigInt(lovelaceAvailable) + BigInt(finalOutputLovelaces.quantity),
          );
        }
      } else {
        // If there's no lovelace remaining, then we return the change outputs
        // each with min utxo value, and we set valueFulfilled to false to indicate this
        valueFulfilled = false;
      }
    } else {
      changeOutputs.push({
        address: changeAddress,
        amount: valueAssets,
      });
      if (lovelaceAvailable < 0n) {
        // lovelaceAvailable being negative means that we didn't have enough
        // lovelaces to cover fees, we set valueFulfilled to false
        valueFulfilled = false;
      }
    }

    return { changeOutputs, valueFulfilled };
  }

  /**
   * Expand UTxOs until fees are covered, iteratively computing fee and change.
   */
  private async expandForFees(
    selectedUtxos: UTxO[],
    remainingUtxos: UTxO[],
    accumulatedValue: Value,
    requiredValue: Value,
    changeAddress: string,
    constraints: BuilderCallbacks,
  ): Promise<{
    finalSelectedUtxos: Set<UTxO>;
    fee: bigint;
    changeOutputs: TxOutput[];
  }> {
    const finalSelected = new Set(selectedUtxos);
    let remainingValue = subValue(accumulatedValue, requiredValue);
    let available = [...remainingUtxos];

    // Sort by lovelace descending for fee expansion
    available.sort((a, b) => {
      const aLovelace = BigInt(
        a.output.amount.find((x) => x.unit === "lovelace")?.quantity || "0",
      );
      const bLovelace = BigInt(
        b.output.amount.find((x) => x.unit === "lovelace")?.quantity || "0",
      );
      return Number(bLovelace - aLovelace);
    });

    let computedCost = 0n;
    let computedChangeOutputs: TxOutput[] = [];
    let numberOfIterations = 3;

    for (let i = 0; i < numberOfIterations; i++) {
      const remainingValueWithCost = subValue(
        remainingValue,
        new Map([["lovelace", computedCost]]),
      );
      const { changeOutputs, valueFulfilled } = this.computeChangeOutputs(
        remainingValueWithCost,
        changeAddress,
        constraints,
      );
      computedChangeOutputs = changeOutputs;

      if (!valueFulfilled) {
        if (available.length === 0) {
          throw new CoinSelectionError(
            "final",
            filterPositives(subValue(requiredValue, accumulatedValue)),
            [],
            Array.from(finalSelected),
          );
        } else {
          const selectedUtxo = available.shift();
          if (selectedUtxo) {
            finalSelected.add(selectedUtxo);
            const utxoValue = assetsToValue(selectedUtxo.output.amount);
            remainingValue = mergeValue(remainingValue, utxoValue);
            numberOfIterations++; // Increase iterations since we added a new UTxO
          }
        }
      }

      if (i < numberOfIterations - 1) {
        // Recompute the cost
        computedCost = (
          await constraints.computeMinimumCost({
            newInputs: finalSelected,
            newOutputs: new Set(),
            change: changeOutputs,
            fee: MAX_U64,
          })
        ).fee;
      }
    }

    return {
      finalSelectedUtxos: finalSelected,
      fee: computedCost,
      changeOutputs: computedChangeOutputs,
    };
  }

  /**
   * Main selection method implementing the two-phase algorithm.
   */
  async select(
    preselectedUtxos: TxIn[],
    outputs: Output[],
    implicitValue: ImplicitValue,
    utxos: UTxO[],
    changeAddress: string,
    constraints: BuilderCallbacks,
  ): Promise<TransactionPrototype> {
    // Step 1: Compute required value
    const requiredValue = computeNetImplicitSelectionValues(
      preselectedUtxos,
      outputs,
      implicitValue,
    );

    // Step 2: Sanity check - total UTxO value >= required
    let totalUtxoValue: Value = new Map();
    utxos.forEach((utxo) => {
      totalUtxoValue = mergeValue(totalUtxoValue, assetsToValue(utxo.output.amount));
    });

    const checkValue = subValue(totalUtxoValue, requiredValue);
    if (!valueAllPositive(checkValue)) {
      throw new CoinSelectionError(
        "final",
        filterPositives(subValue(requiredValue, totalUtxoValue)),
        utxos,
        [],
      );
    }

    // Step 3: Coverage Phase
    const coverageResult = this.coveragePhase(utxos, requiredValue);

    // Step 4: Magnitude Phase
    const magnitudeResult = this.magnitudePhase(
      coverageResult.remainingUtxos,
      requiredValue,
      coverageResult.accumulatedValue,
      coverageResult.selectedUtxos,
    );

    // Step 5: Fee Expansion
    const { finalSelectedUtxos, fee, changeOutputs } = await this.expandForFees(
      magnitudeResult.selectedUtxos,
      magnitudeResult.remainingUtxos,
      magnitudeResult.accumulatedValue,
      requiredValue,
      changeAddress,
      constraints,
    );

    // Step 6: Validate tx size
    if (
      await constraints.maxSizeExceed({
        newInputs: finalSelectedUtxos,
        newOutputs: new Set(),
        change: changeOutputs,
        fee: fee,
      })
    ) {
      throw new Error("Transaction size exceeds the maximum allowed size.");
    }

    return {
      newInputs: finalSelectedUtxos,
      newOutputs: new Set(),
      change: changeOutputs,
      fee: fee,
    };
  }
}
