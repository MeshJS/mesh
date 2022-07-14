import { Asset } from "./types/types.js";
import { Core } from "./core.js";
import { Blockfrost } from "./provider/blockfrost.js";
import { Tx } from "./tx.js";
import { Infura } from "./provider/infura.js";
import SerializationLib from "./provider/serializationlib.js";

class Mesh {
  private _cardano; // Serialization Lib
  private _blockfrost: Blockfrost;
  private _infura: Infura;
  private _core: Core; // serialize lib
  private _transaction: Tx;
  // private _martify: Martify; // API calls

  constructor() {
    this._core = new Core();
  }

  //** CORE **//

  /**
   * Init Mesh library
   * @param blockfrostApiKey - Get your keys from blockfrost
   * @param network - 0 for testnet, 1 for mainnet
   */
  async init({
    blockfrostApiKey,
    network,
    infuraProjectId,
    infuraProjectSecret,
  }: {
    blockfrostApiKey?: string;
    network: number;
    infuraProjectId?: string;
    infuraProjectSecret?: string;
  }) {
    await this._core.init({ network });

    await SerializationLib.load();
    this._cardano = await SerializationLib.Instance;

    this._transaction = new Tx({
      blockfrost: this._blockfrost,
      core: this._core,
      cardano: this._cardano,
    });

    if (blockfrostApiKey !== undefined && network !== undefined) {
      this._blockfrost = new Blockfrost({ blockfrostApiKey, network });
    }

    if (infuraProjectId !== undefined && infuraProjectSecret !== undefined) {
      this._infura = new Infura({
        projectId: infuraProjectId,
        projectSecret: infuraProjectSecret,
      });
    }
  }

  /**
   * Enable and connect wallet
   *
   * @example
   * ```ts
   * let connected = await Mesh.enableWallet({ walletName: 'ccvault' });
   * ```
   *
   * @param walletName - Available wallets are `ccvault`, `gerowallet` and `nami`
   * @returns - True if wallet is connected
   */
  async enableWallet({ walletName }: { walletName: string }) {
    let connected = await this._core.enableWallet({ walletName });
    console.log("enableWallet 1a", connected)
    // this._transaction = new Tx({
    //   blockfrost: this._blockfrost,
    //   core: this._core,
    // });
    return connected;
  }

  /**
   * Returns a list of all used (included in some on-chain transaction) addresses controlled by the wallet.
   * @returns list of bech32 addresses
   */
  async getUsedAddresses() {
    return await this._core.getUsedAddresses();
  }

  /**
   * Returns the reward addresses owned by the wallet. This can return multiple addresses e.g. CIP-0018.
   * @returns list of reward addresses
   */
  async getRewardAddresses() {
    return await this._core.getRewardAddresses();
  }

  /**
   * Return the first used address
   * @returns first address in string
   */
  async getWalletAddress(): Promise<string> {
    return await this._core.getWalletAddress();
  }

  /**
   * Return the first reward address
   * @returns first address in string
   */
  async getRewardAddress(): Promise<string> {
    const addresses = await this.getRewardAddresses();
    return addresses[0];
  }

  /**
   * return a list of all UTXOs (unspent transaction outputs) controlled by the wallet
   * @returns list of all UTXOs
   */
  async getUtxos() {
    return await this._core.getUtxos();
  }

  /**
   * Get a list wallets installed on this browse
   * @returns a list of available wallets
   */
  async getAvailableWallets() {
    return await this._core.getAvailableWallets();
  }

  /**
   * Returns the network id of the currently connected account. 0 is testnet and 1 is mainnet but other networks can possibly be returned by wallets. Those other network ID values are not governed by this document.
   * @returns 0 is testnet and 1 is mainnet
   */
  async getNetworkId() {
    return await this._core.getNetworkId();
  }

  /**
   * Return lovelace amount
   * @returns lovelance
   */
  async getLovelace() {
    return await this._core.getLovelace();
  }

  /**
   * Get a list of assets in connected wallet
   * @param policyId (optional) if provided will filter only assets in this policy
   * @returns assets - List of asset
   */
  async getAssets({ policyId }: { policyId?: string }): Promise<Asset[]> {
    const assets = await this._core.getAssets();
    if (policyId) {
      const filteredAssets = assets
        .filter(function (el) {
          return el.unit.includes(policyId);
        })
        .map((item) => {
          return item;
        });
      return filteredAssets;
    }
    return assets;
  }

  /**
   * This endpoint utilizes the CIP-0008 signing spec for standardization/safety reasons. It allows the dApp to request the user to sign a payload conforming to said spec.
   * @param payload - Nonce string
   * @returns signature
   */
  async signData({ payload }: { payload: string }) {
    const signature = await this._core.signData({ payload });
    return signature;
  }

  /**
   * Requests that a user sign the unsigned portions of the supplied transaction. The wallet should ask the user for permission, and if given, try to sign the supplied body and return a signed transaction.
   * @param tx - Transaction in CBOR
   * @param partialSign - True if partial sign for multi-signature
   * @returns signature
   */
  async signTx({
    tx,
    partialSign = false,
  }: {
    tx: string;
    partialSign: boolean;
  }) {
    const signature = await this._core.signTx({ tx, partialSign });
    return signature;
  }

  async submitTx({
    tx,
    witnesses,
    metadata = undefined,
  }: {
    tx: string;
    witnesses: string[];
    metadata?: {};
  }) {
    return await this._core.submitTx({
      tx: tx,
      witnesses: witnesses,
      metadata: metadata,
    });
  }

  //** TRANSACTION **//

  /**
   * Send ADA to address
   *
   * @param address An interesting value
   * @param lovelace - amount of lovelance to send
   */
  async makeSimpleTransaction({
    recipientAddress,
    lovelace = 1000000,
  }: {
    paymentAddress: string;
    recipientAddress: string;
    lovelace: number;
  }) {
    const tx = await this._transaction.makeSimpleTransaction({
      paymentAddress: await this.getWalletAddress(),
      recipientAddress,
      lovelace,
    });
    const txSigned = await this._core.signTx({ tx: tx });
    const txHash = await this.submitTx({
      tx: tx,
      witnesses: [txSigned],
    });

    return txHash;
  }

  async makeTransaction({
    inputs,
    outputs,
  }: {
    inputs: [
      {
        address: string;
        assets: {
          [assetId: string]: number;
        };
      }
    ];
    outputs: [
      {
        address: string;
        assets: {
          [assetId: string]: number;
        };
      }
    ];
  }): Promise<string> {
    return await this._transaction.makeTransaction({ inputs, outputs });
  }

  //** MARTIFY **//

  async callSomeApiDoSomething() {}

  //** IPFS **//

  /**
   * Add a file or directory to IPFS.
   * https://docs.infura.io/infura/networks/ipfs/http-api-methods/add
   * Get your Infura project ID and secret from https://infura.io/
   * @param formData
   * @returns {
   *   "Name": "Name of the object : sample-result.json",
   *   "Hash": "Hash of the uploaded object : QmSTkR1kkqMuGEeBS49dxVJjgHRMH6cUYa7D3tcHDQ3ea3",
   *   "Size": "integer indication size in bytes : 2120"
   * }
   */
  async addFileIpfs({ formData }) {
    return await this._infura.addFileIpfs({ formData });
  }

  async newMnemonic() {
    return await this._core.newMnemonic();
  }

  async createWalletMnemonic({ seedPhrase, password }) {
    return await this._core.createWalletMnemonic({ seedPhrase, password });
  }

  async loadWallet({ encryptedRootKey, password, accountIndex = 1 }) {
    return await this._core.loadWallet({
      encryptedRootKey,
      password,
      accountIndex,
    });
  }
}

export default new Mesh();
