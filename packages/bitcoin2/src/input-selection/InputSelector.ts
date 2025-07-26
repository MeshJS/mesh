import { UTxO } from '../providers';

/**
 * Interface for input selection.
 */
export interface InputSelector {
  /**
   * Select inputs from the available UTXOs for the desired outputs.
   *
   * @param changeAddress
   * @param utxos - Array of available UTXOs.
   * @param outputs - Array of desired outputs.
   * @param feeRate - Fee rate in satoshis per byte.
   * @param hasOpReturn - Indicates if the transaction includes an OP_RETURN output.
   * @returns An object containing the selected UTXOs, the outputs as returned by coinselect (which might include a change output),
   *          and the calculated fee. Returns null if no valid selection was found.
   */
  selectInputs(
    changeAddress: string,
    utxos: UTxO[],
    outputs: { address: string; value: bigint }[],
    feeRate: number,
    hasOpReturn: boolean
  ): { selectedUTxOs: UTxO[]; outputs: { address: string; value: number }[]; fee: number } | undefined;
}
