import { MAX_U64 } from "@cardano-sdk/input-selection";

import { Output, TxIn, TxOutput, UTxO, value } from "@meshsdk/common";

import {
  BuilderCallbacks,
  IInputSelector,
  ImplicitValue,
  TransactionPrototype,
} from "./coin-selection-interface";

// Value utilities
type Value = Map<string, bigint>;

const mergeValue = (a: Value, b: Value): Value => {
  const merged: Value = new Map(a);
  b.forEach((quantity, unit) => {
    if (merged.has(unit)) {
      const mergedQuantity = merged.get(unit)! + quantity;
      if (mergedQuantity === 0n) {
        merged.delete(unit);
      } else {
        // Update the quantity for the unit
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
        // Update the quantity for the unit
        subtracted.set(unit, subtractedQuantity);
      }
    } else {
      subtracted.set(unit, -quantity);
    }
  });
  return subtracted;
};

const valueAllNegative = (value: Value): boolean => {
  return Array.from(value.values()).every((v) => v < 0n);
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

/**
 * LargestFirstSelection implements the largest-first coin selection algorithm.
 * It selects UTxOs based on the needed value, starting with the largest UTxOs for
 * each needed token type, and then filling in with smaller UTxOs as needed.
 */
export class LargestFirstSelection implements IInputSelector {
  // Change outputs will be computed
  // dummy output field is used to indicate that these outputs are not real
  // and so we will not check whether there is enough value to cover min utxo value
  private computeChangeOutputs = (
    remainingValue: Value,
    changeAddress: string,
    constraints: BuilderCallbacks,
  ): { changeOutputs: TxOutput[]; valueFulfilled: boolean } => {
    let lovelaceAvailable = remainingValue.get("lovelace") || 0n;
    let valueFulfilled = true;
    const valueAssets = remainingValue
      .entries()
      .filter(([unit, quantity]) => quantity > 0n)
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

      // If there is lovelace remaining, just put it in the last output
      if (lovelaceAvailable > 0n) {
        changeOutputs[changeOutputs.length - 1]!.amount[0]!.quantity = String(
          lovelaceAvailable +
            BigInt(currentBundle[currentBundle.length - 1]!.quantity),
        );
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
    }

    return { changeOutputs, valueFulfilled };
  };

  private expandUtxosUntilFeeCovered = async (
    availableUtxos: UTxO[],
    requiredValue: Value,
    changeAddress: string,
    constraints: BuilderCallbacks,
  ): Promise<{
    finalSelectedUtxos: Set<UTxO>;
    fee: bigint;
    changeOutputs: TxOutput[];
  }> => {
    let remainingValue = subValue(new Map(), requiredValue);
    let remainingUtxos = [...availableUtxos];
    const selectedUtxos = new Set<UTxO>();
    while (remainingUtxos.length > 0) {
      // We select per asset by UTxO with largest quantity of that asset
      const assetToSelect = remainingValue.entries().find(([_, quantity]) => {
        return quantity < 0n;
      });
      if (!assetToSelect) {
        break; // No more assets to select
      }
      const [unit, _] = assetToSelect;
      // Sort remaining UTxOs by the amount of the asset in ascending order
      // ascending order is used so we can select pop the largest UTxO at the end
      // of the array
      remainingUtxos.sort((a, b) => {
        const aValue =
          a.output.amount.find((asset) => asset.unit === unit)?.quantity || 0n;
        const bValue =
          b.output.amount.find((asset) => asset.unit === unit)?.quantity || 0n;
        return Number(aValue) - Number(bValue);
      });
      const selectedUtxo = remainingUtxos.pop();
      if (selectedUtxo) {
        selectedUtxos.add(selectedUtxo);
        const utxoValue = assetsToValue(selectedUtxo.output.amount);
        remainingValue = mergeValue(remainingValue, utxoValue);
      }
      // We first settle all required value, we will handle fees after
      if (valueAllPositive(remainingValue)) {
        break;
      }
    }

    // If we have exhausted all UTxOs and still have negative values,
    // we throw an error
    if (remainingUtxos.length === 0 && !valueAllPositive(remainingValue)) {
      throw new Error("Not enough UTxOs to cover the required value.");
    }

    // We will recompute the costs based on the selected UTxOs
    let computedCost = 0n;
    let computedChangeOutputs: TxOutput[] = [];
    for (let i = 0; i < 3; i++) {
      const remainingValueWithCost = subValue(
        remainingValue,
        new Map([["lovelace", computedCost]]),
      );
      const { changeOutputs, valueFulfilled } = this.computeChangeOutputs(
        remainingValueWithCost,
        changeAddress,
        constraints,
      );
      computedCost = (
        await constraints.computeMinimumCost({
          newInputs: selectedUtxos,
          newOutputs: new Set(),
          change: changeOutputs,
          fee: MAX_U64,
        })
      ).fee;
      computedChangeOutputs = changeOutputs;
      if (!valueFulfilled) {
        if (remainingUtxos.length === 0) {
          throw new Error("Not enough UTxOs to cover the required value.");
        } else {
          const selectedUtxo = remainingUtxos.pop();
          if (selectedUtxo) {
            selectedUtxos.add(selectedUtxo);
            const utxoValue = assetsToValue(selectedUtxo.output.amount);
            remainingValue = mergeValue(remainingValue, utxoValue);
          }
        }
      }
    }

    return {
      finalSelectedUtxos: selectedUtxos,
      fee: computedCost,
      changeOutputs: computedChangeOutputs,
    };
  };

  async select(
    preselectedUtxos: TxIn[],
    outputs: Output[],
    implicitValue: ImplicitValue,
    utxos: UTxO[],
    changeAddress: string,
    constraints: BuilderCallbacks,
  ): Promise<TransactionPrototype> {
    // Implementation of the largest-first selection algorithm
    const requiredValue = computeNetImplicitSelectionValues(
      preselectedUtxos,
      outputs,
      implicitValue,
    );

    let utxosValue: Value = new Map();
    utxos.forEach((utxo) => {
      utxosValue = mergeValue(utxosValue, assetsToValue(utxo.output.amount));
    });

    // Do a sanity check that we have enough UTxOs to cover the required value
    const remainingValue = subValue(utxosValue, requiredValue);
    if (Array.from(remainingValue.values()).every((v) => v >= 0n)) {
      throw new Error("Not enough UTxOs to cover the required value.");
    }

    const { finalSelectedUtxos, fee, changeOutputs } =
      await this.expandUtxosUntilFeeCovered(
        utxos,
        requiredValue,
        changeAddress,
        constraints,
      );

    return {
      newInputs: finalSelectedUtxos,
      newOutputs: new Set(),
      change: changeOutputs,
      fee: fee,
    };
  }
}
