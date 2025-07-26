# Using BitcoinWallet with a Mnemonic Phrase

This guide explains how to initialize and use a `BitcoinWallet` with a 24-word mnemonic phrase.

## Overview

When using the Bitcoin Wallet with a mnemonic phrase, you need to:

1. Convert the mnemonic phrase into a `BitcoinWalletInfo` object
2. Initialize providers for blockchain data and fee estimation
3. Create and use the wallet

## Creating a BitcoinWalletInfo from a Mnemonic

```typescript
import { 
  BitcoinWalletInfo, 
  Network, 
  AddressType, 
  deriveBip39Seed, 
  deriveAccountRootKeyPair 
} from '@mesh/btc';

async function createWalletInfoFromMnemonic(
  mnemonic: string,
  accountIndex = 0,
  walletName = 'Bitcoin Wallet'
): Promise<BitcoinWalletInfo> {
  // 1. Derive seed from mnemonic
  const seed = deriveBip39Seed(mnemonic);
  
  // 2. Derive keys for each address type (testnet)
  const legacyKeyTestnet = deriveAccountRootKeyPair(seed, AddressType.Legacy, Network.Testnet, accountIndex);
  const segwitKeyTestnet = deriveAccountRootKeyPair(seed, AddressType.SegWit, Network.Testnet, accountIndex);
  const nativeSegwitKeyTestnet = deriveAccountRootKeyPair(seed, AddressType.NativeSegWit, Network.Testnet, accountIndex);
  const taprootKeyTestnet = deriveAccountRootKeyPair(seed, AddressType.Taproot, Network.Testnet, accountIndex);
  
  // 3. Derive keys for each address type (mainnet)
  const legacyKeyMainnet = deriveAccountRootKeyPair(seed, AddressType.Legacy, Network.Mainnet, accountIndex);
  const segwitKeyMainnet = deriveAccountRootKeyPair(seed, AddressType.SegWit, Network.Mainnet, accountIndex);
  const nativeSegwitKeyMainnet = deriveAccountRootKeyPair(seed, AddressType.NativeSegWit, Network.Mainnet, accountIndex);
  const taprootKeyMainnet = deriveAccountRootKeyPair(seed, AddressType.Taproot, Network.Mainnet, accountIndex);
  
  // 4. Create and return the wallet info
  return {
    walletName,
    accountIndex,
    encryptedSecrets: {
      mnemonics: mnemonic, // In production, encrypt this!
      seed: seed.toString('hex'), // In production, encrypt this!
    },
    extendedAccountPublicKeys: {
      testnet: {
        legacy: legacyKeyTestnet.pair.publicKey,
        segWit: segwitKeyTestnet.pair.publicKey,
        nativeSegWit: nativeSegwitKeyTestnet.pair.publicKey,
        taproot: taprootKeyTestnet.pair.publicKey,
        electrumNativeSegWit: '', // Add Electrum-specific key if needed
      },
      mainnet: {
        legacy: legacyKeyMainnet.pair.publicKey,
        segWit: segwitKeyMainnet.pair.publicKey,
        nativeSegWit: nativeSegwitKeyMainnet.pair.publicKey,
        taproot: taprootKeyMainnet.pair.publicKey,
        electrumNativeSegWit: '', // Add Electrum-specific key if needed
      },
    },
  };
}
```

## Initializing the BitcoinWallet

```typescript
import { 
  BitcoinWallet, 
  ElectrumNetworkProvider,
  BasicFeeMarketProvider,
  Network 
} from '@mesh/btc';
import { Logger } from 'ts-log';

// Create a simple console logger
const logger: Logger = {
  trace: console.log,
  debug: console.log,
  info: console.log,
  warn: console.warn,
  error: console.error
};

async function initializeWallet(mnemonic: string): Promise<BitcoinWallet> {
  // 1. Create wallet info from mnemonic
  const walletInfo = await createWalletInfoFromMnemonic(mnemonic);
  
  // 2. Set up blockchain data provider
  const dataProvider = new ElectrumNetworkProvider({
    host: 'electrum.blockstream.info',
    port: 50002,
    protocol: 'ssl'
  }, logger);
  
  // 3. Set up fee market provider
  const feeMarketProvider = new BasicFeeMarketProvider(dataProvider);
  
  // 4. Initialize wallet
  const wallet = new BitcoinWallet(
    dataProvider,
    feeMarketProvider,
    30000,  // Poll interval in ms (30s)
    20,     // Transaction history depth
    walletInfo,
    Network.Testnet, // Use Network.Mainnet for mainnet
    true,   // Enable polling
    logger
  );
  
  // 5. Set up event handlers
  wallet.setEventHandlers({
    onBalanceUpdate: (balance) => {
      console.log(`Balance updated: ${balance} satoshis`);
    },
    onTransactionHistoryUpdate: (transactions) => {
      console.log(`Transaction history updated: ${transactions.length} entries`);
    }
  });
  
  return wallet;
}
```

## Using the Wallet

```typescript
async function main() {
  try {
    // 1. Initialize wallet with mnemonic
    // NEVER store mnemonics in code in production!
    const mnemonic = 'your twenty four word mnemonic phrase goes here';
    const wallet = await initializeWallet(mnemonic);
    
    // 2. Get wallet address
    const address = await wallet.getAddress();
    console.log(`Wallet address: ${address.address}`);
    
    // 3. Get current fee market data
    const fees = await wallet.getCurrentFeeMarket();
    console.log(`Fast fee rate: ${fees.fast.feeRate} sat/byte`);
    console.log(`Standard fee rate: ${fees.standard.feeRate} sat/byte`);
    console.log(`Slow fee rate: ${fees.slow.feeRate} sat/byte`);
    
    // 4. Check wallet balance
    console.log(`Current balance: ${wallet.balance} satoshis`);
    
    // 5. Check transaction history
    console.log(`Transaction history: ${wallet.transactionHistory.length} entries`);
    
    // 6. When done, shut down the wallet
    // wallet.shutdown();
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
```

## Security Considerations

1. **Mnemonic Security**: Never store mnemonics in code. In production, always:
   - Get mnemonics from secure user input
   - Encrypt mnemonics before storing
   - Use proper key derivation functions

2. **Network Selection**: Use `Network.Testnet` for testing and `Network.Mainnet` for real Bitcoin.

3. **Error Handling**: Implement proper error handling around network operations.

4. **Resource Management**: Call `wallet.shutdown()` when you're done to prevent memory leaks from polling.

## Advanced Features

- **Transaction Building**: Use the `TransactionBuilder` class for creating and signing transactions.
- **Multiple Address Types**: The wallet supports Legacy, SegWit, Native SegWit, and Taproot addresses.
- **Fee Estimation**: Customize fee estimation strategy based on transaction urgency.

## Example Usage

See the complete example in `examples/wallet-from-mnemonic.ts`.
