/* eslint-disable no-magic-numbers, @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars, no-console, sonarjs/no-identical-functions */
import {
  BlockchainDataProvider,
  BlockInfo,
  FeeEstimationMode,
  TransactionHistoryEntry,
  TransactionStatus,
  UTxO
} from './BitcoinDataProvider';
import { Network } from '../common';

export class StubBitcoinDataProvider implements BlockchainDataProvider {
  constructor(_network: Network = Network.Testnet) {}

  async getLastKnownBlock(): Promise<BlockInfo> {
    return {
      height: 1000,
      hash: '0000000000000000000a1b2c3d4e5f67890123456789abcdefabcdefabcdef'
    };
  }

  async getTransaction(_txHash: string): Promise<TransactionHistoryEntry> {
    return {
      inputs: [
        {
          address: 'tb1qwj666s6uktl2q5am0uej008usfsg93fgrwjuuf',
          txId: '0000000000000000000a1b2c3d4e5f67890123456789abcdefabcdefabcdef',
          index: 0,
          satoshis: BigInt(5000)
        }
      ],
      outputs: [{ address: 'tb1qwj666s6uktl2q5am0uej008usfsg93fgrwjuuf', satoshis: BigInt(4000) }],
      transactionHash: 'd528068a1156d135430c815573c79faa7d45b3f395728e92322f3db1ad99da30',
      confirmations: 10,
      status: TransactionStatus.Confirmed,
      blockHeight: 999,
      timestamp: new Date().getUTCSeconds()
    };
  }

  async getTransactions(
    address: string,
    _afterBlockHeight?: number,
    _limit = 50,
    _cursor = ''
  ): Promise<{ transactions: TransactionHistoryEntry[]; nextCursor: string }> {
    return {
      transactions: [
        {
          inputs: [
            {
              address: 'tb1qwj666s6uktl2q5am0uej008usfsg93fgrwjuuf',
              txId: '0000000000000000000a1b2c3d4e5f67890123456789abcdefabcdefabcdef',
              index: 0,
              satoshis: BigInt(5000)
            }
          ],
          outputs: [
            { address: 'tb1qwj666s6uktl2q5am0uej008usfsg93fgrwjuuf', satoshis: BigInt(4000) },
            { address, satoshis: BigInt(9000) }
          ],
          transactionHash: 'd528068a1156d135430c815573c79faa7d45b3f395728e92322f3db1ad99da30',
          confirmations: 10,
          status: TransactionStatus.Confirmed,
          blockHeight: 999,
          timestamp: new Date().getUTCSeconds()
        }
      ],
      nextCursor: ''
    };
  }

  async getTransactionsInMempool(address: string, _afterBlockHeight?: number): Promise<TransactionHistoryEntry[]> {
    return [
      {
        inputs: [
          {
            address: 'tb1qwj666s6uktl2q5am0uej008usfsg93fgrwjuuf',
            txId: '0000000000000000000a1b2c3d4e5f67890123456789abcdefabcdefabcdef',
            index: 0,
            satoshis: BigInt(5000)
          }
        ],
        outputs: [
          { address: 'tb1qwj666s6uktl2q5am0uej008usfsg93fgrwjuuf', satoshis: BigInt(4000) },
          { address, satoshis: BigInt(9000) }
        ],
        transactionHash: 'd528068a1156d135430c815573c79faa7d45b3f395728e92322f3db1ad99da30',
        confirmations: 10,
        status: TransactionStatus.Confirmed,
        blockHeight: 999,
        timestamp: new Date().getUTCSeconds()
      }
    ];
  }

  async getUTxOs(address: string): Promise<UTxO[]> {
    return [
      {
        txId: 'd528068a1156d135430c815573c79faa7d45b3f395728e92322f3db1ad99da30',
        index: 0,
        satoshis: BigInt(100_000),
        address
      }
    ];
  }

  async submitTransaction(rawTransaction: string): Promise<string> {
    console.log('Mock transaction submitted:', rawTransaction);
    return 'd528068a1156d135430c815573c79faa7d45b3f395728e92322f3db1ad99da30';
  }

  async getTransactionStatus(_txHash: string): Promise<TransactionStatus> {
    return TransactionStatus.Confirmed;
  }

  async estimateFee(blocks: number, _mode: FeeEstimationMode): Promise<{ feeRate: number; blocks: number }> {
    return {
      feeRate: 10, // sat/vB
      blocks
    };
  }
}
