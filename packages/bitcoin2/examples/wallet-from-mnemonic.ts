/**
 * Example: Creating a Bitcoin Wallet from a Mnemonic
 * 
 * This example demonstrates how to:
 * 1. Use a mnemonic phrase to create a BitcoinWalletInfo
 * 2. Initialize a BitcoinWallet with that info
 * 3. Use basic wallet functionality
 */

import { Logger } from 'ts-log';
import { BitcoinWallet } from '../src/wallet/BitcoinWallet';
import { FeeMarketProvider } from '../src/wallet/FeeMarketProvider';
import { BlockchainDataProvider, TransactionHistoryEntry, UTxO } from '../src/providers';
import { Network, BitcoinWalletInfo, DerivedAddress } from '../src/common';

/**
 * This is a simplified example - in a real app, you would:
 * 1. Use real providers (like Electrum, Maestro, etc.)
 * 2. Properly derive keys from mnemonics
 * 3. Implement encryption for wallet secrets
 */

// Create a simple logger
const logger: Logger = {
  trace: console.log,
  debug: console.log,
  info: console.log,
  warn: console.warn,
  error: console.error
};

// Mock blockchain provider for example purposes
class MockBlockchainProvider implements BlockchainDataProvider {
  async getLastKnownBlock() {
    return { hash: 'mock-hash', height: 800000 };
  }
  
  async getUTxOs() {
    return [] as UTxO[];
  }
  
  async getTransactions() {
    return { transactions: [], nextCursor: '' };
  }
  
  async getTransactionsInMempool() {
    return [];
  }
  
  async getTransaction(txHash: string): Promise<TransactionHistoryEntry> {
    return {
      transactionHash: txHash,
      blockHeight: 800000,
      confirmations: 1,
      status: 'Confirmed' as any,
      timestamp: Math.floor(Date.now() / 1000),
      inputs: [],
      outputs: []
    };
  }
  
  async submitTransaction(rawTx: string) {
    return 'mock-transaction-id';
  }
  
  async getTransactionStatus() {
    return 'Pending' as any;
  }
  
  async estimateFee() {
    return { feeRate: 5, blocks: 3 };
  }
}

// Mock fee market provider
class MockFeeMarketProvider implements FeeMarketProvider {
  async getFeeMarket() {
    return {
      fast: { feeRate: 10, targetConfirmationTime: 600 },
      standard: { feeRate: 5, targetConfirmationTime: 1200 },
      slow: { feeRate: 1, targetConfirmationTime: 3600 }
    };
  }
}

// Helper function to simulate creating a BitcoinWalletInfo from a mnemonic
// In a real application, you would derive keys properly from the mnemonic
async function createWalletInfoFromMnemonic(
  mnemonic: string, 
  accountIndex = 0,
  walletName = 'My Bitcoin Wallet'
): Promise<BitcoinWalletInfo> {
  // This is for demonstration only! A real implementation would:
  // 1. Derive a seed from the mnemonic
  // 2. Derive HD keys for each address type (legacy, segwit, native segwit, etc.)
  // 3. Extract extended public keys
  // 4. Properly construct the wallet info
  
  // For demo, we'll just use pre-configured wallet info
  return {
    walletName,
    accountIndex,
    encryptedSecrets: {
      mnemonics: mnemonic, // In real app, encrypt this!
      seed: 'mock-seed-value',
    },
    extendedAccountPublicKeys: {
      mainnet: {
        legacy: 'xpub6CXqm3qd33LhU2AMmUnKjsgZuBZQfNPZ6ww3tbVpBNYZjbcPLTU43beBUvmMpMGsLQ2SKisS38FgQdKS5WtVy8fa46GokjgBVeUkwVzApTR',
        segWit: 'xpub6DWj4HZsHB273iZThWdcBwvCxvDRWQkwSi3SjPQje5RvVbrKc61GoqVaHtkN2ha3sJCHEaFXSjsFNFgTfDMrFmHD848QRUtL9ZcRYtymKN6',
        nativeSegWit: 'xpub6DQVZkr4QyJR5RiBtTqSZg2WTHxo9D1jcexG4WjFCwQfwy9XUQ7vM8QFeXeBcGUuCXeBsPCZ525WGuhm6dE6tcyU9aUiGm9EotXYvfTwBqt',
        taproot: 'xpub6DSS1V32GwHMqZihBK9JaZgd6xnVugkEkPaSkbZgAYbzZC41nbUqcuH2N3tgeFMWudvJuYfX8kqWsKUd4oj3H3cUR6mPySGPL3PV6yzu7ko',
        electrumNativeSegWit: 'xpub6D3Tc2KGUuhyTv5EdgR5eUmgG4Ai7DzYrsRCimRC9vYZLXcuKsFVkWySGPrsdqUsvpLDyiXeRJ9kKzTZVrtTWm8BUc539mQ2VGEnQwkiKox',
      },
      testnet: {
        legacy: 'xpub6CLkFqDprtawP8VB21Hzgy5jhwgg7FhDDfJeeNn8Afv5supgd2V38x3E3R5om1ZN7avQiL6gcpYAQX71391WvmfymybGeyxEnHzEWBFQMrY',
        segWit: 'xpub6C99JbTvGxYtBXEHUG7HMe8hJq9GFFRaAw5JsHprckQGmQCbqzDbRiznL3Shc8fsAxAa1GVhKdFYL4pFsgKh5hhS9Ddg5Ni6NSUgMzFprqF',
        nativeSegWit: 'xpub6CrzGDoCVV56RUEdoKWVVXCA5JUJr9PQMQvXaUiGKjfBzZgwkJtKtHfvz3rCDnVL4qriaeZixHARX5MifcSDzZMnwBGVng5AqLZrsE1sUg1',
        taproot: 'xpub6CZnCLkMMgC8aDH1yMeQeZnLGk7qeRxSG8pwHQvb2dkbXAuRopV57RoZLBUqBWMmiqxCaDDwpVWFCfLLAAJkWW4NCy4CKB4U2UUx95hnTYN',
        electrumNativeSegWit: 'xpub6Bju9NoEG4m4x95tv1uX5fu7cCKf3ormkGbV3qtsvnwRqUmqcmCrej8RGQGmxWJRN23gfpZstUZ1uMnxUgkHju5udzPXqrJqDsq719UwXHj',
      }
    }
  };
}

/**
 * Main example function showing how to create and use a Bitcoin wallet
 */
async function initializeAndUseWallet() {
  try {
    // Example mnemonic (NEVER use this in production!)
    // In a real app, get this securely from the user or secure storage
    const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    
    console.log("Creating wallet info from mnemonic...");
    const walletInfo = await createWalletInfoFromMnemonic(mnemonic);
    
    console.log("Creating blockchain data provider...");
    const dataProvider = new MockBlockchainProvider();
    
    console.log("Creating fee market provider...");
    const feeMarketProvider = new MockFeeMarketProvider();
    
    console.log("Initializing Bitcoin wallet...");
    const wallet = new BitcoinWallet(
      dataProvider,
      feeMarketProvider,
      30000, // Poll interval (30s)
      20,    // History depth
      walletInfo,
      Network.Testnet,
      true,  // Enable polling
      logger
    );
    
    // Set up event handlers
    wallet.setEventHandlers({
      onBalanceUpdate: (balance: bigint) => {
        console.log(`Balance updated: ${balance} satoshis`);
      },
      onTransactionHistoryUpdate: (transactions: TransactionHistoryEntry[]) => {
        console.log(`Received ${transactions.length} transactions in history`);
      },
      onAddressesUpdate: (addresses: DerivedAddress[]) => {
        console.log(`Addresses updated: ${addresses.map(a => a.address).join(', ')}`);
      }
    });
    
    // Use the wallet
    const address = await wallet.getAddress();
    console.log(`\nWallet address: ${address.address}`);
    
    // Get fee estimates
    const fees = await wallet.getCurrentFeeMarket();
    console.log(`\nFee estimates:`);
    console.log(`- Fast: ${fees.fast.feeRate} sat/byte (${fees.fast.targetConfirmationTime}s)`);
    console.log(`- Standard: ${fees.standard.feeRate} sat/byte (${fees.standard.targetConfirmationTime}s)`);
    console.log(`- Slow: ${fees.slow.feeRate} sat/byte (${fees.slow.targetConfirmationTime}s)`);
    
    // Get balance
    console.log(`\nCurrent balance: ${wallet.balance} satoshis`);
    
    console.log("\nWallet is ready to use!");
    console.log("In a real application, you would:");
    console.log("1. Keep the wallet running to receive updates");
    console.log("2. Implement transaction creation and signing");
    console.log("3. Properly handle wallet lifecycle events");
    
    // For demo purposes, shut down after a short delay
    console.log("\nWill shutdown wallet in 5 seconds...");
    setTimeout(() => {
      wallet.shutdown();
      console.log("Wallet shutdown complete.");
    }, 5000);
  } catch (error) {
    console.error("Error initializing wallet:", error);
  }
}

// Uncomment to run the example:
// initializeAndUseWallet().catch(console.error);
