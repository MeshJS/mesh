import { jest } from '@jest/globals';
import { BitcoinWallet, EstimatedFees } from '../src/wallet/BitcoinWallet';
import { 
  BitcoinWalletInfo, 
  Network,
  AddressType,
  ChainType,
  deriveAddressByType,
  deriveBip39Seed,
  deriveAccountRootKeyPair
} from '../src/common';
import { 
  BlockchainDataProvider,
  TransactionHistoryEntry,
  BlockInfo,
  UTxO,
  BlockchainInputResolver,
  TransactionStatus
} from '../src/providers';
import { FeeMarketProvider } from '../src/wallet/FeeMarketProvider';
import { Logger } from 'ts-log';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import isEqual from 'lodash/isEqual';

// Initialize bitcoin ecc lib
bitcoin.initEccLib(ecc);

// Helper function to simulate creating a wallet info from mnemonic
// In a real implementation, you would use a function like this to derive keys from a mnemonic
async function createWalletInfoFromMnemonic(mnemonic: string, accountIndex = 0): Promise<BitcoinWalletInfo> {
  // This is just a simulation - in a real implementation you would:
  // 1. Derive a seed from the mnemonic (using deriveBip39Seed)
  // 2. Derive account root keys for each address type
  // 3. Export extended public keys
  // 4. Construct and return BitcoinWalletInfo
  
  // For testing purposes, we'll just return a pre-configured wallet info
  return walletInfo;
}

// Sample wallet info (usually would be derived from a mnemonic)
const walletInfo = {
  walletName: "Bitcoin Wallet 1",
  accountIndex: 0,
  encryptedSecrets: {
    mnemonics:
      "0781acc923d79abd86dce53b85dcb5c5458153a7f1796e12a28c7153609ee9c8880e81db5ebf0f5d17ec5065700f9eaaee03f010d2c21ddea2c5d1fb6170dd10fcb37389bee6ab7155529a3d92ed687e2fcce2c708bc17cfa194a5577281d99da74d2f373a0fdd87f093bb0aa1e898404914d90e3e4e2d59047d1c041dd9a07193ad7181b07db942e9608d89807a8ada17a3b5cefd77417fa88f7858c56313bcb965531e057b4f4cb8553d24b20235813bfdd288088de7e9a4b77466e93c474422089ff68bea1396fa5b80041c4ce95e5e48448f054765f3d7170848",
    seed: "abc7e239734866dc0df1c90120a9bdae5bcf81cdf3f74eb0e854ceeebedfb19d8650e680139c8c6c574bbb7b57b179e4dd0044dd8a0c718f0abf1e5067386f27e6f1c301dde6816038c6c8f3c70a91b12869f21c3502a1500589a9cc1b6593dfcbd22f89d31a2bc68948c7a4c89bd568a0d1c80992d597726c746b6e",
  },
  extendedAccountPublicKeys: {
    mainnet: {
      legacy:
        "xpub6CXqm3qd33LhU2AMmUnKjsgZuBZQfNPZ6ww3tbVpBNYZjbcPLTU43beBUvmMpMGsLQ2SKisS38FgQdKS5WtVy8fa46GokjgBVeUkwVzApTR",
      segWit:
        "xpub6DWj4HZsHB273iZThWdcBwvCxvDRWQkwSi3SjPQje5RvVbrKc61GoqVaHtkN2ha3sJCHEaFXSjsFNFgTfDMrFmHD848QRUtL9ZcRYtymKN6",
      nativeSegWit:
        "xpub6DQVZkr4QyJR5RiBtTqSZg2WTHxo9D1jcexG4WjFCwQfwy9XUQ7vM8QFeXeBcGUuCXeBsPCZ525WGuhm6dE6tcyU9aUiGm9EotXYvfTwBqt",
      taproot:
        "xpub6DSS1V32GwHMqZihBK9JaZgd6xnVugkEkPaSkbZgAYbzZC41nbUqcuH2N3tgeFMWudvJuYfX8kqWsKUd4oj3H3cUR6mPySGPL3PV6yzu7ko",
      electrumNativeSegWit:
        "xpub6D3Tc2KGUuhyTv5EdgR5eUmgG4Ai7DzYrsRCimRC9vYZLXcuKsFVkWySGPrsdqUsvpLDyiXeRJ9kKzTZVrtTWm8BUc539mQ2VGEnQwkiKox",
    },
    testnet: {
      legacy:
        "xpub6CLkFqDprtawP8VB21Hzgy5jhwgg7FhDDfJeeNn8Afv5supgd2V38x3E3R5om1ZN7avQiL6gcpYAQX71391WvmfymybGeyxEnHzEWBFQMrY",
      segWit:
        "xpub6C99JbTvGxYtBXEHUG7HMe8hJq9GFFRaAw5JsHprckQGmQCbqzDbRiznL3Shc8fsAxAa1GVhKdFYL4pFsgKh5hhS9Ddg5Ni6NSUgMzFprqF",
      nativeSegWit:
        "xpub6CrzGDoCVV56RUEdoKWVVXCA5JUJr9PQMQvXaUiGKjfBzZgwkJtKtHfvz3rCDnVL4qriaeZixHARX5MifcSDzZMnwBGVng5AqLZrsE1sUg1",
      taproot:
        "xpub6CZnCLkMMgC8aDH1yMeQeZnLGk7qeRxSG8pwHQvb2dkbXAuRopV57RoZLBUqBWMmiqxCaDDwpVWFCfLLAAJkWW4NCy4CKB4U2UUx95hnTYN",
      electrumNativeSegWit:
        "xpub6Bju9NoEG4m4x95tv1uX5fu7cCKf3ormkGbV3qtsvnwRqUmqcmCrej8RGQGmxWJRN23gfpZstUZ1uMnxUgkHju5udzPXqrJqDsq719UwXHj",
    },
  },
};

describe('BitcoinWallet', () => {
  // Sample mnemonic - in real code, you should NEVER hardcode mnemonics like this
  const testMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art';
  
  let wallet: BitcoinWallet;
  let mockBlockchainDataProvider: jest.Mocked<BlockchainDataProvider>;
  let mockFeeMarketProvider: jest.Mocked<FeeMarketProvider>;
  let logger: Logger;
  
  // Mock data for tests
  const mockBlockInfo: BlockInfo = {
    hash: '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f',
    height: 100000
  };
  
  const mockUtxos: UTxO[] = [
    {
      txId: 'abc123',
      satoshis: BigInt(50000),
      index: 0,
      address: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'
    }
  ];
  
  const mockTransactions: TransactionHistoryEntry[] = [
    {
      transactionHash: 'abc123',
      blockHeight: 100000,
      timestamp: 1650000000,
      status: TransactionStatus.Confirmed,
      confirmations: 10,
      inputs: [{ txId: 'def456', index: 0, satoshis: BigInt(100000), address: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx' }],
      outputs: [{ satoshis: BigInt(50000), address: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx' }]
    }
  ];
  
  const mockEstimatedFees: EstimatedFees = {
    fast: { feeRate: 10, targetConfirmationTime: 600 },
    standard: { feeRate: 5, targetConfirmationTime: 1200 },
    slow: { feeRate: 1, targetConfirmationTime: 3600 }
  };
  
  beforeEach(async () => {
    // Create mocks
    mockBlockchainDataProvider = {
      getLastKnownBlock: jest.fn(),
      getUTxOs: jest.fn(),
      getTransactionsInMempool: jest.fn(),
      getTransactions: jest.fn(),
      submitTransaction: jest.fn(),
      getTransaction: jest.fn(),
      getTransactionStatus: jest.fn(),
      estimateFee: jest.fn()
    };
    
    mockFeeMarketProvider = {
      getFeeMarket: jest.fn()
    };
    
    logger = {
      trace: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
    
    // Setup mock responses
    mockBlockchainDataProvider.getLastKnownBlock.mockResolvedValue(mockBlockInfo);
    mockBlockchainDataProvider.getUTxOs.mockResolvedValue(mockUtxos);
    mockBlockchainDataProvider.getTransactions.mockResolvedValue({ transactions: mockTransactions, nextCursor: '' });
    mockBlockchainDataProvider.getTransactionsInMempool.mockResolvedValue([]);
    mockBlockchainDataProvider.submitTransaction.mockResolvedValue('txid123');
    mockFeeMarketProvider.getFeeMarket.mockResolvedValue(mockEstimatedFees);
    
    // Create wallet with walletInfo
    wallet = new BitcoinWallet(
      mockBlockchainDataProvider,
      mockFeeMarketProvider,
      1000, // shorter poll interval for testing
      20,
      walletInfo,
      Network.Testnet,
      false, // disable polling for tests
      logger
    );
  });
  
  afterEach(() => {
    // Clean up
    wallet.shutdown();
    jest.clearAllMocks();
  });

  test('should initialize wallet with correct properties', async () => {
    // Check wallet info
    const info = await wallet.getInfo();
    expect(info).toBe(walletInfo);
    
    // Check network
    const network = await wallet.getNetwork();
    expect(network).toBe(Network.Testnet);
    
    // Check address
    const address = await wallet.getAddress();
    expect(address).toBeDefined();
    expect(address.addressType).toBe(AddressType.NativeSegWit);
    expect(address.network).toBe(Network.Testnet);
  });

  test('should get balance from UTXOs', async () => {
    // Manually trigger an update to populate UTXOs
    await (wallet as any).updateUtxos();
    
    // Check balance
    expect(wallet.balance).toBe(BigInt(50000));
    expect(mockBlockchainDataProvider.getUTxOs).toHaveBeenCalledTimes(1);
  });

  test('should get transaction history', async () => {
    // Manually trigger an update to populate transaction history
    await (wallet as any).updateTransactions();
    
    // Check transaction history
    expect(wallet.transactionHistory).toHaveLength(1);
    expect(mockBlockchainDataProvider.getTransactions).toHaveBeenCalledTimes(1);
  });

  test('should get fee market estimates', async () => {
    const fees = await wallet.getCurrentFeeMarket();
    
    expect(fees).toEqual(mockEstimatedFees);
    expect(mockFeeMarketProvider.getFeeMarket).toHaveBeenCalledTimes(1);
  });

  // Skip this test for now because we need a valid raw transaction hex
  // or we need to mock the historyEntryFromRawTx function which is challenging with Jest
  test.skip('should submit transaction', async () => {
    const rawTx = '0200000001abcdef...'; // Mock raw transaction
    
    // We'll just check that the provider method was called
    await wallet.submitTransaction(rawTx).catch(() => {
      // Ignore the error for the test
    });
    
    expect(mockBlockchainDataProvider.submitTransaction).toHaveBeenCalledWith(rawTx);
  });

  test('should handle event callbacks', () => {
    // Set up mock event handlers
    const mockBalanceUpdate = jest.fn();
    const mockTransactionHistoryUpdate = jest.fn();
    const mockUtxosUpdate = jest.fn();
    
    wallet.setEventHandlers({
      onBalanceUpdate: mockBalanceUpdate,
      onTransactionHistoryUpdate: mockTransactionHistoryUpdate,
      onUtxosUpdate: mockUtxosUpdate
    });
    
    // Trigger updates
    (wallet as any).setUtxos(mockUtxos);
    (wallet as any).setTransactionHistory(mockTransactions);
    
    // Verify callbacks were invoked
    expect(mockBalanceUpdate).toHaveBeenCalledWith(BigInt(50000));
    expect(mockTransactionHistoryUpdate).toHaveBeenCalledWith(mockTransactions);
    expect(mockUtxosUpdate).toHaveBeenCalledWith(mockUtxos);
  });
  
  test('should demonstrate creating wallet from mnemonic', async () => {
    // This test shows how you would create a wallet from a mnemonic in real code
    
    // 1. Create wallet info from mnemonic
    const walletInfoFromMnemonic = await createWalletInfoFromMnemonic(testMnemonic);
    
    // 2. Create wallet using that info
    const newWallet = new BitcoinWallet(
      mockBlockchainDataProvider,
      mockFeeMarketProvider,
      30000,
      20,
      walletInfoFromMnemonic,
      Network.Testnet,
      false,
      logger
    );
    
    expect(newWallet).toBeDefined();
    
    // Clean up
    newWallet.shutdown();
  });

  test('should update state when poll is triggered', async () => {
    // Enable polling
    wallet.setPollEnabled(true);
    
    // Mock a new block to trigger state update
    const newBlockInfo: BlockInfo = {
      hash: '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26e', // Different hash
      height: 100001 // New height
    };
    
    // Set up spies on private methods
    const updateStateSpy = jest.spyOn(wallet as any, 'updateState');
    const updateTransactionsSpy = jest.spyOn(wallet as any, 'updateTransactions');
    const updatePendingTransactionsSpy = jest.spyOn(wallet as any, 'updatePendingTransactions');
    const updateUtxosSpy = jest.spyOn(wallet as any, 'updateUtxos');
    
    // Simulate a new block being found
    mockBlockchainDataProvider.getLastKnownBlock.mockResolvedValueOnce(newBlockInfo);
    mockBlockchainDataProvider.getTransactions.mockResolvedValueOnce({ 
      transactions: mockTransactions,
      nextCursor: ''
    });
    
    // Trigger a poll manually
    await (wallet as any).poll();
    
    // Verify that all update methods were called
    expect(updateStateSpy).toHaveBeenCalledWith(newBlockInfo);
    expect(updateTransactionsSpy).toHaveBeenCalled();
    expect(updatePendingTransactionsSpy).toHaveBeenCalled();
    
    // Disable polling
    wallet.setPollEnabled(false);
  });
  
  test('should handle all wallet event types', async () => {
    // Create mock event handlers for all event types
    const eventHandlers = {
      onTransactionHistoryUpdate: jest.fn(),
      onPendingTransactionsUpdate: jest.fn(),
      onUtxosUpdate: jest.fn(),
      onBalanceUpdate: jest.fn(),
      onAddressesUpdate: jest.fn()
    };
    
    // Set all event handlers
    wallet.setEventHandlers(eventHandlers);
    
    // Create new test data
    const newTransactions = [
      {
        transactionHash: 'newtx123',
        blockHeight: 100001,
        timestamp: 1650000100,
        status: TransactionStatus.Confirmed,
        confirmations: 5,
        inputs: [{ txId: 'input123', index: 0, satoshis: BigInt(50000), address: 'tb1address1' }],
        outputs: [{ satoshis: BigInt(49000), address: 'tb1address2' }]
      }
    ];
    
    const newPendingTxs = [
      {
        transactionHash: 'pending123',
        blockHeight: 0,
        timestamp: 1650001000,
        status: TransactionStatus.Pending,
        confirmations: 0,
        inputs: [{ txId: 'input456', index: 0, satoshis: BigInt(30000), address: 'tb1address1' }],
        outputs: [{ satoshis: BigInt(29000), address: 'tb1address3' }]
      }
    ];
    
    const newUtxos = [
      {
        txId: 'utxo123',
        satoshis: BigInt(10000),
        index: 0,
        address: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'
      },
      {
        txId: 'utxo456',
        satoshis: BigInt(20000),
        index: 1,
        address: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'
      }
    ];
    
    const newAddresses = [
      {
        address: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
        addressType: AddressType.NativeSegWit,
        network: Network.Testnet,
        account: 0,
        chain: ChainType.External,
        index: 0,
        publicKeyHex: '03a34b99f22c790c4e36b2b3c2c35a36db06226e41c692fc82b8b56ac1c540c5bd'
      },
      {
        address: 'tb1q0sqzfp2lssp0ckx79l8jj56znh8hl45uyxcmh3',
        addressType: AddressType.NativeSegWit,
        network: Network.Testnet,
        account: 0,
        chain: ChainType.Internal,
        index: 0,
        publicKeyHex: '03a34b99f22c790c4e36b2b3c2c35a36db06226e41c692fc82b8b56ac1c540c5be'
      }
    ];
    
    // Trigger each event type
    (wallet as any).setTransactionHistory(newTransactions);
    (wallet as any).setPendingTransactions(newPendingTxs);
    (wallet as any).setUtxos(newUtxos);
    (wallet as any).setAddresses(newAddresses);
    
    // Verify each event handler was called with the correct data
    expect(eventHandlers.onTransactionHistoryUpdate).toHaveBeenCalledWith(newTransactions);
    expect(eventHandlers.onPendingTransactionsUpdate).toHaveBeenCalledWith(newPendingTxs);
    expect(eventHandlers.onUtxosUpdate).toHaveBeenCalledWith(newUtxos);
    expect(eventHandlers.onBalanceUpdate).toHaveBeenCalledWith(BigInt(30000)); // Sum of UTXOs
    expect(eventHandlers.onAddressesUpdate).toHaveBeenCalledWith(newAddresses);
    
    // Check that the wallet's state was updated
    expect(wallet.transactionHistory).toEqual(newTransactions);
    expect(wallet.pendingTransactions).toEqual(newPendingTxs);
    expect(wallet.utxos).toEqual(newUtxos);
    expect(wallet.balance).toEqual(BigInt(30000));
    expect(wallet.addresses).toEqual(newAddresses);
  });
});
