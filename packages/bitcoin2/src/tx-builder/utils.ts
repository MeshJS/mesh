import * as bitcoin from 'bitcoinjs-lib';
import { InputResolver, TransactionHistoryEntry, TransactionStatus } from '../providers';
import { Network } from '../common';

/**
 * Converts a raw transaction hexadecimal string into a TransactionHistoryEntry.
 *
 * @param {string} raw - The raw transaction hexadecimal string.
 * @param {Network} network - The network type (Mainnet or Testnet) to which the transaction belongs.
 * @param inputResolver - The input resolver.
 * @returns {TransactionHistoryEntry} The structured transaction history entry derived from the raw transaction.
 */
/**
 * Converts a raw transaction hex into a TransactionHistoryEntry using an InputResolver to fetch additional input details.
 *
 * This function deserializes a raw Bitcoin transaction hex and transforms it into a transaction history entry.
 * It uses an InputResolver to asynchronously fetch and include details about each input, such as the associated address
 * and the amount of satoshis, which are not directly available from the transaction input script.
 *
 * @param {string} raw - The raw hexadecimal string of the Bitcoin transaction.
 * @param {Network} network - The Bitcoin network (Mainnet or Testnet) that the transaction pertains to.
 * @param {InputResolver} inputResolver - An instance of InputResolver to fetch additional input details.
 * @returns {Promise<TransactionHistoryEntry>} A promise that resolves to a detailed transaction history entry.
 */
export const historyEntryFromRawTx = async (
  raw: string,
  network: Network,
  inputResolver: InputResolver
): Promise<TransactionHistoryEntry> => {
  const tx = bitcoin.Transaction.fromHex(raw);
  const bitcoinNetwork = network === Network.Mainnet ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;

  const resolvedInputs = await Promise.all(
    tx.ins.map(async (input) => {
      const txId = Buffer.from(input.hash).reverse().toString('hex');
      const index = input.index;
      try {
        return await inputResolver.resolve(txId, index);
      } catch (error) {
        console.warn(`Failed to resolve input ${txId}:${index}`, error);
        return {
          txId,
          index,
          address: '',
          satoshis: BigInt(0)
        };
      }
    })
  );

  const resolvedOutputs = tx.outs.map((o) => {
    const chunks = bitcoin.script.decompile(o.script);
    const isNullData = chunks && chunks[0] === bitcoin.opcodes.OP_RETURN;

    if (isNullData) {
      const payloadChunks = chunks.slice(1).filter((c): c is Buffer => Buffer.isBuffer(c));

      const opReturnData = Buffer.concat(payloadChunks).toString('utf8');

      return {
        address: '',
        satoshis: BigInt(o.value),
        opReturnData
      };
    }

    const address = bitcoin.address.fromOutputScript(o.script, bitcoinNetwork);
    return { address, satoshis: BigInt(o.value) };
  });

  return {
    inputs: resolvedInputs,
    outputs: resolvedOutputs,
    transactionHash: tx.getId(),
    confirmations: 0,
    status: TransactionStatus.Pending,
    blockHeight: 0,
    timestamp: 0
  };
};
