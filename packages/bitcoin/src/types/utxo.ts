/**
 * Represents an unspent transaction output (UTxO) in the Bitcoin blockchain.
 *
 * @property {string} txId - The unique identifier (transaction hash) of the transaction that created this output.
 * @property {number} index - The output index within the transaction.
 * @property {bigint} satoshis - The value of this output in satoshis.
 * @property {string} address - The common associated with this UTxO. This is the recipient of the funds in this output.
 */
export type UTxO = {
  readonly txId: string;
  readonly index: number;
  readonly satoshis: bigint;
  readonly address: string;
};