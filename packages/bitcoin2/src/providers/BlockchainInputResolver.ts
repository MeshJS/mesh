import { BlockchainDataProvider, UTxO } from './BitcoinDataProvider';
import { InputResolver } from './InputResolver';

/**
 * Represents an implementation of the `InputResolver` interface that fetches detailed information
 * about a transaction input from the blockchain data provider.
 */
export class BlockchainInputResolver implements InputResolver {
  constructor(private dataProvider: BlockchainDataProvider) {}

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
  async resolve(txId: string, index: number): Promise<UTxO> {
    const transaction = await this.dataProvider.getTransaction(txId);
    if (!transaction || index >= transaction.outputs.length) {
      throw new Error('Transaction or output index not found');
    }

    const output = transaction.outputs[index];

    return {
      txId,
      index,
      address: output.address,
      satoshis: output.satoshis
    };
  }
}
