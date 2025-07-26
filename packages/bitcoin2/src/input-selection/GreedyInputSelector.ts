/* eslint-disable consistent-return */
import { UTxO } from '../providers';
import { INPUT_SIZE, OUTPUT_SIZE, TRANSACTION_OVERHEAD, DUST_THRESHOLD } from '../common';
import { InputSelector } from './InputSelector';

const ZERO = BigInt(0);

/**
 * A concrete implementation of InputSelector that uses a simple greedy algorithm.
 */
export class GreedyInputSelector implements InputSelector {
  public selectInputs(
    changeAddress: string,
    utxos: UTxO[],
    outputs: { address: string; value: bigint }[],
    feeRate: number,
    hasOpReturn: boolean
  ): { selectedUTxOs: UTxO[]; outputs: { address: string; value: number }[]; fee: number } | undefined {
    const selected: UTxO[] = [];
    const totalOutput = outputs.reduce((acc, o) => acc + o.value, ZERO);
    let inputSum = ZERO;
    let fee = 0;

    for (const utxo of utxos) {
      selected.push(utxo);
      inputSum += utxo.satoshis;
      fee = this.computeFee(selected.length, outputs.length + 1, feeRate, hasOpReturn);
      if (inputSum >= totalOutput + BigInt(fee)) break;
    }

    if (inputSum < totalOutput + BigInt(fee)) return undefined;

    let change = inputSum - totalOutput - BigInt(fee);

    if (change > ZERO && Number(change) < DUST_THRESHOLD) {
      const { change: newChange, fee: feeDelta } = this.attemptDustRescue({
        change,
        feeRate,
        selected,
        remaining: utxos.slice(selected.length),
        inputSum,
        totalOutput,
        outputsCount: outputs.length,
        hasOpReturn
      });
      change = newChange;
      fee += feeDelta;

      if (change < BigInt(DUST_THRESHOLD)) {
        fee += Number(change);
        change = ZERO;
      }
    }

    const finalOutputs = outputs.map(({ address, value }) => ({ address, value: Number(value) }));

    if (change >= BigInt(DUST_THRESHOLD)) {
      finalOutputs.push({ address: changeAddress, value: Number(change) });
    }

    return { selectedUTxOs: selected, outputs: finalOutputs, fee };
  }

  /** Estimate the fee for a given input / output count */
  private computeFee(inputCount: number, outputCount: number, feeRate: number, hasOpReturn: boolean): number {
    const size =
      inputCount * INPUT_SIZE + (outputCount + (hasOpReturn ? 1 : 0)) * OUTPUT_SIZE + Number(TRANSACTION_OVERHEAD);
    return Math.ceil(size * feeRate);
  }

  /**
   * Try to pull one more UTxO so that change exceeds the dust threshold if
   * the value rescued is worth more than the added fee.
   */
  private attemptDustRescue({
    change,
    feeRate,
    selected,
    remaining,
    inputSum,
    totalOutput,
    outputsCount,
    hasOpReturn
  }: {
    change: bigint;
    feeRate: number;
    selected: UTxO[];
    remaining: UTxO[];
    inputSum: bigint;
    totalOutput: bigint;
    outputsCount: number;
    hasOpReturn: boolean;
  }): { change: bigint; fee: number } {
    if (change === ZERO || Number(change) >= DUST_THRESHOLD) return { change, fee: 0 };

    const originalChange = change;
    let feeDelta = 0;

    for (const utxo of remaining) {
      const newInputSum = inputSum + utxo.satoshis;
      const newFee = this.computeFee(selected.length + 1, outputsCount + 1, feeRate, hasOpReturn);
      const newChange = newInputSum - totalOutput - BigInt(newFee);

      const rescued = newChange - originalChange;
      const extraCost = BigInt(Math.ceil(INPUT_SIZE * feeRate));

      if (rescued >= extraCost && newChange >= BigInt(DUST_THRESHOLD)) {
        selected.push(utxo);
        feeDelta = newFee - this.computeFee(selected.length - 1, outputsCount + 1, feeRate, hasOpReturn);
        return { change: newChange, fee: feeDelta };
      }
    }

    return { change, fee: 0 };
  }
}
