import { UTxO } from './BitcoinDataProvider';

/**
 * Represents an interface for resolving specific inputs of a transaction.
 *
 * This interface provides a method to fetch detailed information about a transaction input,
 * identified by its transaction ID (`txId`) and output index (`index`). The information
 * retrieved includes the address that owns the input and the amount of satoshis contained in it,
 * encapsulated within a `UTxO` object.
 */
export interface InputResolver {
  /**
   * Resolves the transaction input to a `UTxO` object providing detailed information
   * about the input, including the owning address and the amount.
   *
   * @param {string} txId - The hexadecimal string representing the transaction ID of the input to resolve.
   * @param {number} index - The zero-based index of the input within the transaction's list of outputs.
   *
   * @returns {Promise<UTxO>} A promise that resolves to a `UTxO` object containing the resolved input details.
   * If the input cannot be resolved, the promise should reject with an error explaining the failure.
   */
  resolve(txId: string, index: number): Promise<UTxO>;
}
