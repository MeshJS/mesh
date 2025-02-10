import {
  AccountInfo,
  Asset,
  AssetMetadata,
  BlockInfo,
  fromUTF8,
  IFetcher,
  Protocol,
  SUPPORTED_HANDLES,
  TransactionInfo,
  UTxO
} from "@meshsdk/common";
import { parseHttpError } from "../utils";

type AssetAddress = {
  address: string;
  quantity: string;
}

/**
 * OfflineFetcher implements the IFetcher interface to provide offline access to blockchain data.
 * This class allows working with pre-loaded blockchain data without requiring network connectivity.
 * It's useful for testing, development, and scenarios where offline operation is needed.
 *
 * The class maintains internal storage for various blockchain data types:
 * - Account information
 * - UTXOs (Unspent Transaction Outputs)
 * - Asset addresses and metadata
 * - Block information
 * - Protocol parameters
 * - Transaction information
 *
 * Example usage:
 * ```typescript
 * import { OfflineFetcher } from '@meshsdk/core';
 *
 * // Create a new instance
 * const fetcher = new OfflineFetcher();
 *
 * // Add some blockchain data
 * fetcher.addAccount(address, accountInfo);
 * fetcher.addUTxOs(utxos);
 *
 * // Use the fetcher with MeshWallet
 * const wallet = new MeshWallet({
 *   networkId: 0,
 *   fetcher: fetcher,
 *   key: {
 *     type: 'address',
 *     address: walletAddress
 *   }
 * });
 * ```
 */
export class OfflineFetcher implements IFetcher {
  private accounts: Record<string, AccountInfo> = {};
  private utxos: Record<string, UTxO[]> = {};
  private assetAddresses: Record<string, AssetAddress[]> = {};
  private assetMetadata: Record<string, AssetMetadata> = {};
  private blocks: Record<string, BlockInfo> = {};
  private collections: Record<string, Asset[]> = {};
  private protocolParameters: Record<number, Protocol> = {};
  private transactions: Record<string, TransactionInfo> = {};

  private paginate<T>(items: T[], cursor?: number | string, pageSize: number = 20): { paginatedItems: T[], nextCursor?: number  } {
    const startIndex = cursor != null ? parseInt(String(cursor), 10) : 0;
    const paginatedItems = items.slice(startIndex, startIndex + pageSize);
    const nextCursor = (startIndex + pageSize) < items.length ? startIndex + pageSize : undefined;
    return { paginatedItems, nextCursor };
  }


  /**
   * Fetches account information for a given address.
   * @param address - Address to fetch info for
   * @returns Promise resolving to account information
   * @throws Error if account not found
   */
  async fetchAccountInfo(address: string): Promise<AccountInfo> {
    const account = this.accounts[address];
    if (!account) throw new Error(`Account not found: ${address}`);
    return account;
  }

  /**
   * Fetches UTXOs for a given address, optionally filtered by asset.
   * @param address - Address to fetch UTXOs for
   * @param asset - Optional asset ID to filter UTXOs
   * @returns Promise resolving to array of UTXOs
   */
  async fetchAddressUTxOs(address: string, asset?: string): Promise<UTxO[]> {
    const addressUtxos = this.utxos[address] || [];
    return asset ? addressUtxos.filter(utxo => utxo.output.amount.some(a => a.unit === asset)) : addressUtxos;
  }

  /**
   * Fetches addresses holding a specific asset.
   * @param asset - Asset identifier
   * @returns Promise resolving to array of asset addresses and quantities
   */
  async fetchAssetAddresses(asset: string): Promise<AssetAddress[]> {
    if (!OfflineFetcher.isValidHex(asset)) {
      throw new Error("Invalid asset: must be a hex string");
    }

    const addressMap = new Map<string, bigint>();

    // Get addresses from asset addresses registry
    const registryAddresses = this.assetAddresses[asset] || [];
    for (const addr of registryAddresses) {
      addressMap.set(addr.address, BigInt(addr.quantity));
    }

    // Get addresses from UTXOs
    for (const [address, utxos] of Object.entries(this.utxos)) {
      for (const utxo of utxos) {
        const assetAmount = utxo.output.amount.find(amt => amt.unit === asset);
        if (assetAmount) {
          const currentAmount = addressMap.get(address) || BigInt(0);
          addressMap.set(address, currentAmount + BigInt(assetAmount.quantity));
        }
      }
    }

    // Convert map to array of AssetAddress objects
    return Array.from(addressMap.entries())
      .filter(([_, quantity]) => quantity > BigInt(0))
      .map(([address, quantity]) => ({
        address,
        quantity: quantity.toString()
      }));
  }

  /**
   * Fetches all assets associated with an address.
   * @param address - Address to fetch assets for
   * @returns Promise resolving to array of assets held by the address
   */
  async fetchAddressAssets(address: string): Promise<Asset[]> {
    if (!OfflineFetcher.isValidAddress(address)) {
      throw new Error("Invalid address: must be a valid Bech32 or Base58 address");
    }

    const assetMap = new Map<string, bigint>();

    // Get assets from UTXOs
    const addressUtxos = this.utxos[address] || [];
    for (const utxo of addressUtxos) {
      for (const amount of utxo.output.amount) {
        const currentAmount = assetMap.get(amount.unit) || BigInt(0);
        assetMap.set(amount.unit, currentAmount + BigInt(amount.quantity));
      }
    }

    // Get assets from asset addresses registry
    for (const [assetId, addresses] of Object.entries(this.assetAddresses)) {
      const assetAddress = addresses.find(addr => addr.address === address);
      if (assetAddress) {
        const currentAmount = assetMap.get(assetId) || BigInt(0);
        assetMap.set(assetId, currentAmount + BigInt(assetAddress.quantity));
      }
    }

    // Convert map back to array of Assets
    return Array.from(assetMap.entries())
      .map(([unit, quantity]) => ({
        unit,
        quantity: quantity.toString()
      }));
  }

  /**
   * Fetches metadata for a specific asset.
   * @param asset - Asset identifier
   * @returns Promise resolving to asset metadata
   * @throws Error if asset metadata not found
   */
  async fetchAssetMetadata(asset: string): Promise<AssetMetadata> {
    const metadata = this.assetMetadata[asset];
    if (!metadata) throw new Error(`Asset metadata not found: ${asset}`);
    return metadata;
  }

  /**
   * Fetches information about a specific block.
   * @param hash - Block hash
   * @returns Promise resolving to block information
   * @throws Error if block not found
   */
  async fetchBlockInfo(hash: string): Promise<BlockInfo> {
    const block = this.blocks[hash];
    if (!block) throw new Error(`Block not found: ${hash}`);
    return block;
  }

  /**
   * Fetches assets in a collection (by policy ID) with pagination.
   * @param policyId - Policy ID of the collection
   * @param cursor - Optional pagination cursor
   * @returns Promise resolving to paginated assets and next cursor
   * @throws Error if collection not found or invalid cursor
   */
  async fetchCollectionAssets(policyId: string, cursor?: number | string): Promise<{ assets: Asset[], next?: string | number }> {
    const assets = this.collections[policyId];
    if (!assets) throw new Error(`Collection not found: ${policyId}`);

    if (cursor && !OfflineFetcher.isIntegerString(String(cursor))) {
      throw new Error("Invalid cursor: must be a string of digits");
    }

    const { paginatedItems, nextCursor } = this.paginate(assets, cursor);
    return { assets: paginatedItems, next: nextCursor };
  }


  /**
   * Fetches metadata for a handle.
   * @param handle - Handle to fetch metadata for
   * @returns Promise resolving to handle metadata
   * @throws Error if handle not found or invalid
   */
  async fetchHandle(handle: string): Promise<AssetMetadata> {
    try {
      const assetName = fromUTF8(handle.replace("$", ""));
      const handleAsset = `${SUPPORTED_HANDLES[1]}000de140${assetName}`;
      return await this.fetchAssetMetadata(handleAsset);
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  /**
   * Fetches address associated with a handle.
   * @param handle - Handle to fetch address for
   * @returns Promise resolving to address
   * @throws Error if no address found for handle
   */
  async fetchHandleAddress(handle: string): Promise<string> {
    const assetName = fromUTF8(handle.replace("$", ""));
    const policyId = SUPPORTED_HANDLES[1];
    const addresses = await this.fetchAssetAddresses(`${policyId}${assetName}`);

    const address = addresses[0]?.address;
    if (!address) {
      throw new Error(`No addresses found for handle: ${handle}`);
    }

    return address;
  }

  /**
   * Fetches protocol parameters for a specific epoch.
   * @param epoch - Epoch number
   * @returns Promise resolving to protocol parameters
   * @throws Error if parameters not found for epoch
   */
  async fetchProtocolParameters(epoch?: number): Promise<Protocol> {
    if(!epoch) {
      const maxEpochNumber = Math.max(...Object.keys(this.protocolParameters).map(Number));
      return this.protocolParameters[maxEpochNumber]!;
    }
    const parameters = this.protocolParameters[epoch];
    if (!parameters) throw new Error(`Protocol parameters not found for epoch: ${epoch}`);
    return parameters;
  }

  /**
   * Fetches information about a specific transaction.
   * @param hash - Transaction hash
   * @returns Promise resolving to transaction information
   * @throws Error if transaction not found
   */
  async fetchTxInfo(hash: string): Promise<TransactionInfo> {
    const transaction = this.transactions[hash];
    if (!transaction) throw new Error(`Transaction not found: ${hash}`);
    return transaction;
  }

  /**
   * Fetches all UTXOs associated with a specific transaction hash.
   * @param hash - Transaction hash to fetch UTXOs for
   * @returns Promise resolving to array of UTXOs associated with the transaction
   * @throws Error if no UTXOs found for the transaction hash
   */
  async fetchUTxOs(hash: string): Promise<UTxO[]> {
    const utxos = Object.values(this.utxos).flat().filter(utxo => utxo.input.txHash === hash);
    if (!utxos.length) throw new Error(`No UTxOs found for transaction hash: ${hash}`);
    return utxos;
  }

  async fetchGovernanceProposal(txHash: string, certIndex: number): Promise<any> {
    throw new Error("Method not implemented");
  }

  /**
   * HTTP GET method required by IFetcher interface but not implemented in OfflineFetcher.
   * @param url - URL to fetch from
   * @throws Error always, as this fetcher operates offline
   */
  async get(url: string): Promise<any> {
    throw new Error("Method not implemented in OfflineFetcher.");
  }

  /**
   * Serializes fetcher data to JSON string.
   * @returns JSON string containing all fetcher data
   */
  toJSON(): string {
    return JSON.stringify({
      accounts: this.accounts,
      utxos: this.utxos,
      assetAddresses: this.assetAddresses,
      assetMetadata: this.assetMetadata,
      blocks: this.blocks,
      collections: this.collections,
      protocolParameters: this.protocolParameters,
      transactions: this.transactions
    });
  }

  /**
   * Creates an OfflineFetcher instance from JSON data.
   * @param json - JSON string containing fetcher data
   * @returns New OfflineFetcher instance
   */
  static fromJSON(json: string): OfflineFetcher {
    const data = JSON.parse(json);
    const fetcher = new OfflineFetcher();

    Object.entries(data.accounts || {}).forEach(([address, info]) =>
      fetcher.addAccount(address, info as AccountInfo));

    Object.entries(data.utxos || {}).forEach(([address, utxos]) =>
      fetcher.addUTxOs(utxos as UTxO[]));

    Object.entries(data.assetAddresses || {}).forEach(([asset, addresses]) =>
      fetcher.addAssetAddresses(asset, addresses as AssetAddress[]));

    Object.entries(data.assetMetadata || {}).forEach(([asset, metadata]) =>
      fetcher.addAssetMetadata(asset, metadata as AssetMetadata));

    Object.entries(data.blocks || {}).forEach(([_, info]) =>
      fetcher.addBlock(info as BlockInfo));

    Object.entries(data.collections || {}).forEach(([policyId, assets]) =>
      fetcher.addCollectionAssets(assets as Asset[]));

    Object.entries(data.protocolParameters || {}).forEach(([_, params]) =>
      fetcher.addProtocolParameters(params as Protocol));

    Object.entries(data.transactions || {}).forEach(([_, info]) =>
      fetcher.addTransaction(info as TransactionInfo));

    return fetcher;
  }

  private static isValidHex(str: string, length?: number): boolean {
    if (length !== undefined && str.length !== length) {
      return false;
    }
    return /^[0-9a-fA-F]+$/.test(str);
  }

  private static isValidAddress(address: string): boolean {
    return (
      OfflineFetcher.isValidBech32Address(address) ||
      OfflineFetcher.isValidBase58(address)
    );
  }

  private static isValidBase58(input: string): boolean {
    // Base58 character set (Bitcoin alphabet)
    const base58Regex = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/;
    // Check that input matches Base58 character set
    if (!base58Regex.test(input)) {
      return false;
    }
    // Additional checks can be added here, such as length or checksum validation
    return true;
  }

  private static isValidBech32(input: string, prefix: string): boolean {
    // Check if the input is all lowercase or all uppercase
    if (input !== input.toLowerCase() && input !== input.toUpperCase()) {
      return false;
    }

    // Bech32 regex pattern for the given prefix
    const pattern = new RegExp(`^${prefix}1[02-9ac-hj-np-z]+$`, 'i');
    return pattern.test(input);
  }

  private static isValidBech32Address(address: string): boolean {
    return OfflineFetcher.isValidBech32(address, '(addr|addr_test)');
  }

  private static isValidBech32Pool(poolId: string): boolean {
    return OfflineFetcher.isValidBech32(poolId, 'pool');
  }

  private static isValidBech32VrfVk(vrfKey: string): boolean {
    return OfflineFetcher.isValidBech32(vrfKey, 'vrf_vk');
  }


  private static isIntegerString(str: string): boolean {
    return /^\d+$/.test(str);
  }

  private static isValidAssetOrLovelace(asset: string): boolean {
    if (asset === 'lovelace') {
      return true;
    }
    if (asset.length < 56) {
      return false;
    }
    return OfflineFetcher.isValidHex(asset);
  }


  /**
   * Adds account information to the fetcher.
   * @param address - Account address
   * @param accountInfo - Account information
   * @throws Error if address or account info invalid
   */
  addAccount(address: string, accountInfo: AccountInfo): void {
    if (!OfflineFetcher.isValidAddress(address)) {
      throw new Error("Invalid address: must be a valid Bech32 or Base58 address");
    }

    if (accountInfo.poolId !== undefined) {
      if (!OfflineFetcher.isValidBech32Pool(accountInfo.poolId)) {
        throw new Error("Invalid 'poolId': must be a valid Bech32 pool address");
      }
    }

    if (!OfflineFetcher.isIntegerString(accountInfo.balance)) {
      throw new Error("Invalid 'balance': must be a string of digits");
    }

    if (!OfflineFetcher.isIntegerString(accountInfo.rewards)) {
      throw new Error("Invalid 'rewards': must be a string of digits");
    }

    if (!OfflineFetcher.isIntegerString(accountInfo.withdrawals)) {
      throw new Error("Invalid 'withdrawals': must be a string of digits");
    }

    this.accounts[address] = accountInfo;
  }


  /**
   * Adds UTXOs to the fetcher.
   * @param utxos - Array of UTXOs
   * @throws Error if UTXOs invalid
   */
  addUTxOs(utxos: UTxO[]): void {
    if (!Array.isArray(utxos) || utxos.length === 0) {
      throw new Error("Invalid utxos: must be a non-empty array");
    }

    utxos.forEach((utxo, index) => {
      if (!Number.isInteger(utxo.input.outputIndex) || utxo.input.outputIndex < 0) {
        throw new Error(`Invalid outputIndex for UTxO at index ${index}: must be a non-negative integer`);
      }
      if (!OfflineFetcher.isValidHex(utxo.input.txHash, 64)) {
        throw new Error(`Invalid txHash for UTxO at index ${index}: must be a 64-character hexadecimal string`);
      }

      if (!OfflineFetcher.isValidAddress(utxo.output.address)) {
        throw new Error(`Invalid address in output for UTxO at index ${index}: must be a valid Bech32 or Base58 address`);
      }
      if (!Array.isArray(utxo.output.amount) || utxo.output.amount.length === 0) {
        throw new Error(`Invalid amount for UTxO at index ${index}: must be a non-empty array of assets`);
      }

      utxo.output.amount.forEach((asset, assetIndex) => {
        if(!OfflineFetcher.isValidAssetOrLovelace(asset.unit)) {
          throw new Error(`Invalid unit for asset at index ${assetIndex} in UTxO at index ${index}`);
        }
        if (!OfflineFetcher.isIntegerString(asset.quantity)) {
          throw new Error(`Invalid quantity for asset at index ${assetIndex} in UTxO at index ${index}: must be a string of digits`);
        }
      });

      if (utxo.output.dataHash !== undefined && !OfflineFetcher.isValidHex(utxo.output.dataHash, 64)) {
        throw new Error(`Invalid dataHash for UTxO at index ${index}: must be a 64-character hexadecimal string or undefined`);
      }
      if (utxo.output.plutusData !== undefined && !OfflineFetcher.isValidHex(utxo.output.plutusData)) {
        throw new Error(`Invalid plutusData for UTxO at index ${index}: must be a hexadecimal string or undefined`);
      }
      if (utxo.output.scriptRef !== undefined && !OfflineFetcher.isValidHex(utxo.output.scriptRef)) {
        throw new Error(`Invalid scriptRef for UTxO at index ${index}: must be a hexadecimal string or undefined`);
      }
      if (utxo.output.scriptHash !== undefined && !OfflineFetcher.isValidHex(utxo.output.scriptHash, 56)) {
        throw new Error(`Invalid scriptHash for UTxO at index ${index}: must be a 56-character hexadecimal string or undefined`);
      }
    });

    for (const utxo of utxos) {
      if (!this.utxos[utxo.output.address]) {
        this.utxos[utxo.output.address] = [];
      }
      this.utxos[utxo.output.address]!.push(utxo);
    }
  }

  /**
   * Adds asset address information to the fetcher.
   * @param asset - Asset identifier
   * @param addresses - Array of asset addresses
   * @throws Error if asset or addresses invalid
   */
  addAssetAddresses(asset: string, addresses: AssetAddress[]): void {
    if (!OfflineFetcher.isValidHex(asset)) {
      throw new Error("Invalid asset: must be a hex string");
    }
    if (addresses.length === 0) {
      throw new Error("Invalid addresses: must be a non-empty array");
    }
    addresses.forEach((item, index) => {
      if (!OfflineFetcher.isValidAddress(item.address)) {
        throw new Error(`Invalid 'address' field at index ${index}, should be bech32 string`);
      }
      if (!OfflineFetcher.isIntegerString(item.quantity)) {
        throw new Error(`Invalid 'quantity' field at index ${index}, should be a string of digits`);
      }
    });
    this.assetAddresses[asset] = addresses;
  }

  /**
   * Adds asset metadata to the fetcher.
   * @param asset - Asset identifier
   * @param metadata - Asset metadata
   * @throws Error if asset or metadata invalid
   */
  addAssetMetadata(asset: string, metadata: AssetMetadata): void {
    if (asset.length < 56) {
      throw new Error(`Invalid asset ${asset}: must be a string longer than 56 characters`);
    }
    if (!OfflineFetcher.isValidHex(asset)) {
      throw new Error("Invalid asset: must be a hex string");
    }

    if (typeof metadata !== 'object' || metadata === null) {
      throw new Error("Invalid metadata object");
    }
    this.assetMetadata[asset] = metadata;
  }

  /**
   * Adds collection assets to the fetcher.
   * @param assets - Array of assets
   * @throws Error if assets invalid
   */
  addCollectionAssets(assets: Asset[]): void {
    if (!Array.isArray(assets) || assets.length === 0) {
      throw new Error("Invalid assets: must be a non-empty array");
    }

    const groupedAssets: { [policyId: string]: Asset[] } = {};

    assets.forEach((asset, index) => {
      if (asset.unit.length < 56) {
        throw new Error(`Invalid unit for asset at index ${index}: must be a string longer than 56 characters`);
      }

      if(!OfflineFetcher.isValidHex(asset.unit)) {
        throw new Error(`Invalid unit for asset at index ${index}: must be a hexadecimal string`);
      }

      const policyId = asset.unit.slice(0, 56);

      if (!OfflineFetcher.isValidHex(policyId, 56)) {
        throw new Error(`Invalid policyId in asset unit at index ${index}: must be a 56-character hexadecimal string`);
      }

      if (!OfflineFetcher.isIntegerString(asset.quantity)) {
        throw new Error(`Invalid quantity for asset at index ${index}: must be a string of digits`);
      }

      if (!groupedAssets[policyId]) {
        groupedAssets[policyId] = [];
      }
      groupedAssets[policyId].push(asset);
    });

    for (const [policyId, policyAssets] of Object.entries(groupedAssets)) {
      if (!this.collections[policyId]) {
        this.collections[policyId] = [];
      }
      this.collections[policyId] = this.collections[policyId].concat(policyAssets);
    }
  }

  /**
   * Adds protocol parameters to the fetcher.
   * @param parameters - Protocol parameters
   * @throws Error if parameters invalid
   */
  addProtocolParameters(parameters: Protocol): void {
    if (parameters.epoch < 0 || !Number.isInteger(parameters.epoch)) {
      throw new Error("Invalid epoch: must be a non-negative integer");
    }

    if (parameters.minFeeA < 0 || !Number.isInteger(parameters.minFeeA)) {
      throw new Error("Invalid 'minFeeA': must be a non-negative integer");
    }
    if (parameters.minFeeB < 0 || !Number.isInteger(parameters.minFeeB)) {
      throw new Error("Invalid 'minFeeB': must be a non-negative integer");
    }
    if (parameters.maxBlockSize <= 0 || !Number.isInteger(parameters.maxBlockSize)) {
      throw new Error("Invalid 'maxBlockSize': must be a positive integer");
    }
    if (parameters.maxTxSize <= 0 || !Number.isInteger(parameters.maxTxSize)) {
      throw new Error("Invalid 'maxTxSize': must be a positive integer");
    }
    if (parameters.maxBlockHeaderSize <= 0 || !Number.isInteger(parameters.maxBlockHeaderSize)) {
      throw new Error("Invalid 'maxBlockHeaderSize': must be a positive integer");
    }
    if (parameters.keyDeposit < 0 || !Number.isInteger(parameters.keyDeposit)) {
      throw new Error("Invalid 'keyDeposit': must be a non-negative integer");
    }
    if (parameters.poolDeposit < 0 || !Number.isInteger(parameters.poolDeposit)) {
      throw new Error("Invalid 'poolDeposit': must be a non-negative integer");
    }
    if (parameters.decentralisation < 0 || parameters.decentralisation > 1) {
      throw new Error("Invalid 'decentralisation': must be between 0 and 1");
    }
    if (parameters.priceMem < 0) {
      throw new Error("Invalid 'priceMem': must be non-negative");
    }
    if (parameters.priceStep < 0) {
      throw new Error("Invalid 'priceStep': must be non-negative");
    }
    if (parameters.maxValSize < 0 || !Number.isInteger(parameters.maxValSize)) {
      throw new Error("Invalid 'maxValSize': must be a non-negative integer");
    }
    if (parameters.collateralPercent < 0) {
      throw new Error("Invalid 'collateralPercent': must be a non-negative integer");
    }
    if (parameters.maxCollateralInputs < 0 || !Number.isInteger(parameters.maxCollateralInputs)) {
      throw new Error("Invalid 'maxCollateralInputs': must be a non-negative integer");
    }
    if (parameters.coinsPerUtxoSize < 0) {
      throw new Error("Invalid 'coinsPerUtxoSize': must be non-negative");
    }
    if (parameters.minFeeRefScriptCostPerByte < 0) {
      throw new Error("Invalid 'minFeeRefScriptCostPerByte': must be non-negative");
    }

    if (!OfflineFetcher.isIntegerString(parameters.minPoolCost)) {
      throw new Error("Invalid 'minPoolCost': must be a string of digits");
    }
    if (!OfflineFetcher.isIntegerString(parameters.maxTxExMem)) {
      throw new Error("Invalid 'maxTxExMem': must be a string of digits");
    }
    if (!OfflineFetcher.isIntegerString(parameters.maxTxExSteps)) {
      throw new Error("Invalid 'maxTxExSteps': must be a string of digits");
    }
    if (!OfflineFetcher.isIntegerString(parameters.maxBlockExMem)) {
      throw new Error("Invalid 'maxBlockExMem': must be a string of digits");
    }
    if (!OfflineFetcher.isIntegerString(parameters.maxBlockExSteps)) {
      throw new Error("Invalid 'maxBlockExSteps': must be a string of digits");
    }

    this.protocolParameters[parameters.epoch] = parameters;
  }

  /**
   * Adds transaction information to the fetcher.
   * @param txInfo - Transaction information
   * @throws Error if transaction info invalid
   */
  addTransaction(txInfo: TransactionInfo): void {
    if (!OfflineFetcher.isValidHex(txInfo.hash, 64)) {
      throw new Error("Invalid transaction hash: must be a 64-character hexadecimal string");
    }
    if (!Number.isInteger(txInfo.index) || txInfo.index < 0) {
      throw new Error("Invalid 'index': must be a non-negative integer");
    }
    if (!OfflineFetcher.isValidHex(txInfo.block, 64)) {
      throw new Error("Invalid 'block': must be a 64-character hexadecimal string");
    }
    if (!OfflineFetcher.isIntegerString(txInfo.slot)) {
      throw new Error("Invalid 'slot': must be a string of digits");
    }
    if (!OfflineFetcher.isIntegerString(txInfo.fees)) {
      throw new Error("Invalid 'fees': must be a string of digits");
    }
    if (!Number.isInteger(txInfo.size) || txInfo.size <= 0) {
      throw new Error("Invalid 'size': must be a positive integer");
    }
    if (!/^-?\d+$/.test(txInfo.deposit)) {
      throw new Error("Invalid 'deposit': must be a string representing an integer (positive or negative)");
    }
    if (txInfo.invalidBefore !== "" && !OfflineFetcher.isIntegerString(txInfo.invalidBefore)) {
      throw new Error("Invalid 'invalidBefore': must be a string of digits or empty string");
    }
    if (txInfo.invalidAfter !== "" && !OfflineFetcher.isIntegerString(txInfo.invalidAfter)) {
      throw new Error("Invalid 'invalidAfter': must be a string of digits or empty string");
    }
    this.transactions[txInfo.hash] = txInfo;
  }

  /**
   * Adds block information to the fetcher.
   * @param blockInfo - Block information
   * @throws Error if block info invalid
   */
  addBlock(blockInfo: BlockInfo): void {
    if (!OfflineFetcher.isValidHex(blockInfo.hash, 64)) {
      throw new Error("Invalid block hash: must be a 64-character hexadecimal string");
    }
    if (!Number.isInteger(blockInfo.time) || blockInfo.time < 0) {
      throw new Error("Invalid 'time': must be a non-negative integer");
    }
    if (!OfflineFetcher.isIntegerString(blockInfo.slot)) {
      throw new Error("Invalid 'slot': must be a string of digits");
    }
    if (!Number.isInteger(blockInfo.epoch) || blockInfo.epoch < 0) {
      throw new Error("Invalid 'epoch': must be a non-negative integer");
    }
    if (!OfflineFetcher.isIntegerString(blockInfo.epochSlot)) {
      throw new Error("Invalid 'epochSlot': must be a string of digits");
    }
    if (!OfflineFetcher.isValidBech32Pool(blockInfo.slotLeader)) {
      throw new Error("Invalid 'slotLeader': must be a bech32 string with pool prefix");
    }
    if (!Number.isInteger(blockInfo.size) || blockInfo.size <= 0) {
      throw new Error("Invalid 'size': must be a positive integer");
    }
    if (!Number.isInteger(blockInfo.txCount) || blockInfo.txCount < 0) {
      throw new Error("Invalid 'txCount': must be a non-negative integer");
    }
    if (!OfflineFetcher.isIntegerString(blockInfo.output)) {
      throw new Error("Invalid 'output': must be a string of digits");
    }
    if (!OfflineFetcher.isValidHex(blockInfo.operationalCertificate, 64)) {
      throw new Error("Invalid 'operationalCertificate': must be a 64-character hexadecimal string");
    }
    if (!OfflineFetcher.isValidHex(blockInfo.previousBlock, 64)) {
      throw new Error("Invalid 'previousBlock': must be a 64-character hexadecimal string");
    }
    if (!OfflineFetcher.isValidBech32VrfVk(blockInfo.VRFKey)) {
      throw new Error("Invalid 'VRFKey': must be a bech32 string with vrf_vk1 prefix");
    }
    this.blocks[blockInfo.hash] = blockInfo;
  }
}
