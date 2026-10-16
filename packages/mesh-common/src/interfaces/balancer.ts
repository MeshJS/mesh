import { Protocol } from "../types";
import { UTxO } from "../types/utxo";

/**
 * Settles the numbers of a built transaction that depend on each other: the execution units of
 * every redeemer, the fee, and the lovelace of the change output.
 *
 * `MeshTxBuilder` evaluates scripts before it adds the change output, so the units it declares can
 * be wrong for the transaction it finally builds: a script sees the whole transaction, and an extra
 * output can change what it costs, which changes the fee, which changes the change. A balancer runs
 * that as a loop until the three agree.
 *
 * Coin selection and change placement stay with the builder. An implementation is given the output
 * that should absorb the difference and may edit only its lovelace, the fee, and the redeemers.
 */
export interface ITxBalancer {
  /**
   * @param tx - the serialized transaction, as CBOR hex
   * @param utxos - every UTxO the transaction's inputs, collateral and reference inputs name
   * @param params - the protocol parameters the transaction is built against
   * @param changeOutputIndex - which output absorbs the difference, counting from 0
   * @returns the balanced transaction as CBOR hex
   */
  balanceTx(
    tx: string,
    utxos: UTxO[],
    params: Protocol,
    changeOutputIndex: number,
  ): Promise<string>;
}
