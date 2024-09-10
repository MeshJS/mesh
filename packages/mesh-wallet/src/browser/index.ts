import {
  Asset,
  AssetExtended,
  DataSignature,
  DEFAULT_PROTOCOL_PARAMETERS,
  fromUTF8,
  IInitiator,
  ISigner,
  ISubmitter,
  POLICY_ID_LENGTH,
  resolveFingerprint,
  UTxO,
  Wallet,
} from "@meshsdk/common";
import { csl } from "@meshsdk/core-csl";
import {
  Address,
  addressToBech32,
  buildDRepID,
  CardanoSDKUtil,
  deserializeAddress,
  deserializeTx,
  deserializeTxUnspentOutput,
  deserializeValue,
  Ed25519KeyHashHex,
  Ed25519PublicKey,
  Ed25519PublicKeyHex,
  fromTxUnspentOutput,
  fromValue,
  Serialization,
  toAddress,
  Transaction,
  TransactionUnspentOutput,
  VkeyWitness,
} from "@meshsdk/core-cst";

import { Cardano, WalletInstance } from "../types";
import { checkIfMetamaskInstalled } from "./metamask";

declare global {
  interface Window {
    cardano: Cardano;
  }
}

export class BrowserWallet implements IInitiator, ISigner, ISubmitter {
  walletInstance: WalletInstance;

  private constructor(
    readonly _walletInstance: WalletInstance,
    readonly _walletName: string,
  ) {
    this.walletInstance = { ..._walletInstance };
  }

  /**
   * Returns a list of wallets installed on user's device. Each wallet is an object with the following properties:
   * - A name is provided to display wallet's name on the user interface.
   * - A version is provided to display wallet's version on the user interface.
   * - An icon is provided to display wallet's icon on the user interface.
   *
   * @returns a list of wallet names
   */
  static async getAvailableWallets({
    metamask = {
      network: "preprod",
    },
  }: {
    metamask?: {
      network: string;
    };
  } = {}): Promise<Wallet[]> {
    if (window === undefined) return [];

    if (metamask) await checkIfMetamaskInstalled(metamask.network);

    const wallets = BrowserWallet.getInstalledWallets();
    return wallets;
  }

  /**
   * Returns a list of wallets installed on user's device. Each wallet is an object with the following properties:
   * - A name is provided to display wallet's name on the user interface.
   * - A version is provided to display wallet's version on the user interface.
   * - An icon is provided to display wallet's icon on the user interface.
   *
   * @returns a list of wallet names
   */
  static getInstalledWallets(): Wallet[] {
    if (window === undefined) return [];
    if (window.cardano === undefined) return [];

    let wallets: Wallet[] = [];
    for (const key in window.cardano) {
      try {
        const _wallet = window.cardano[key];
        if (_wallet === undefined) continue;
        if (_wallet.name === undefined) continue;
        if (_wallet.icon === undefined) continue;
        if (_wallet.apiVersion === undefined) continue;
        wallets.push({
          id: key,
          name: key == "nufiSnap" ? "MetaMask" : _wallet.name,
          icon: _wallet.icon,
          version: _wallet.apiVersion,
        });
      } catch (e) {}
    }

    return wallets;
  }

  /**
   * This is the entrypoint to start communication with the user's wallet. The wallet should request the user's permission to connect the web page to the user's wallet, and if permission has been granted, the wallet will be returned and exposing the full API for the dApp to use.
   *
   * Query BrowserWallet.getInstalledWallets() to get a list of available wallets, then provide the wallet name for which wallet the user would like to connect with.
   *
   * @param walletName - the name of the wallet to enable (e.g. "eternl", "begin", "nufiSnap")
   * @param extensions - optional, a list of CIPs that the wallet should support
   * @returns WalletInstance
   */
  static async enable(
    walletName: string,
    extensions: number[] = [],
  ): Promise<BrowserWallet> {
    try {
      const walletInstance = await BrowserWallet.resolveInstance(
        walletName,
        extensions,
      );

      if (walletInstance !== undefined)
        return new BrowserWallet(walletInstance, walletName);

      throw new Error(`Couldn't create an instance of wallet: ${walletName}`);
    } catch (error) {
      throw new Error(
        `[BrowserWallet] An error occurred during enable: ${JSON.stringify(
          error,
        )}.`,
      );
    }
  }

  /**
   * Returns a list of assets in the wallet. This API will return every assets in the wallet. Each asset is an object with the following properties:
   * - A unit is provided to display asset's name on the user interface.
   * - A quantity is provided to display asset's quantity on the user interface.
   *
   * @returns a list of assets and their quantities
   */
  async getBalance(): Promise<Asset[]> {
    const balance = await this._walletInstance.getBalance();
    return fromValue(deserializeValue(balance));
  }

  /**
   * Returns an address owned by the wallet that should be used as a change address to return leftover assets during transaction creation back to the connected wallet.
   *
   * @returns an address
   */
  async getChangeAddress(): Promise<string> {
    const changeAddress = await this._walletInstance.getChangeAddress();
    return addressToBech32(deserializeAddress(changeAddress));
  }

  /**
   * This function shall return a list of one or more UTXOs (unspent transaction outputs) controlled by the wallet that are required to reach AT LEAST the combined ADA value target specified in amount AND the best suitable to be used as collateral inputs for transactions with plutus script inputs (pure ADA-only UTXOs).
   *
   * If this cannot be attained, an error message with an explanation of the blocking problem shall be returned. NOTE: wallets are free to return UTXOs that add up to a greater total ADA value than requested in the amount parameter, but wallets must never return any result where UTXOs would sum up to a smaller total ADA value, instead in a case like that an error message must be returned.
   *
   * @param limit
   * @returns a list of UTXOs
   */
  async getCollateral(): Promise<UTxO[]> {
    const deserializedCollateral = await this.getCollateralUnspentOutput();
    return deserializedCollateral.map((dc) => fromTxUnspentOutput(dc));
  }

  /**
   * Return a list of supported CIPs of the wallet.
   *
   * @returns a list of CIPs
   */
  async getExtensions(): Promise<number[]> {
    try {
      const _extensions: { cip: number }[] =
        await this._walletInstance.getExtensions();
      return _extensions.map((e) => e.cip);
    } catch (e) {
      return [];
    }
  }

  /**
   * Returns the network ID of the currently connected account. 0 is testnet and 1 is mainnet but other networks can possibly be returned by wallets. Those other network ID values are not governed by CIP-30. This result will stay the same unless the connected account has changed.
   *
   * @returns network ID
   */
  getNetworkId(): Promise<number> {
    return this._walletInstance.getNetworkId();
  }

  /**
   * Returns a list of reward addresses owned by the wallet. A reward address is a stake address that is used to receive rewards from staking, generally starts from `stake` prefix.
   *
   * @returns a list of reward addresses
   */
  async getRewardAddresses(): Promise<string[]> {
    const rewardAddresses = await this._walletInstance.getRewardAddresses();
    return rewardAddresses.map((ra) => addressToBech32(deserializeAddress(ra)));
  }

  /**
   * Returns a list of unused addresses controlled by the wallet.
   *
   * @returns a list of unused addresses
   */
  async getUnusedAddresses(): Promise<string[]> {
    const unusedAddresses = await this._walletInstance.getUnusedAddresses();
    return unusedAddresses.map((una) =>
      addressToBech32(deserializeAddress(una)),
    );
  }

  /**
   * Returns a list of used addresses controlled by the wallet.
   *
   * @returns a list of used addresses
   */
  async getUsedAddresses(): Promise<string[]> {
    const usedAddresses = await this._walletInstance.getUsedAddresses();
    return usedAddresses.map((usa) => addressToBech32(deserializeAddress(usa)));
  }

  /**
   * Return a list of all UTXOs (unspent transaction outputs) controlled by the wallet.
   *
   * @returns a list of UTXOs
   */
  async getUtxos(): Promise<UTxO[]> {
    const deserializedUTxOs = await this.getUsedUTxOs();
    return deserializedUTxOs.map((du) => fromTxUnspentOutput(du));
  }

  /**
   * This endpoint utilizes the [CIP-8 - Message Signing](https://cips.cardano.org/cips/cip8/) to sign arbitrary data, to verify the data was signed by the owner of the private key.
   *
   * @param payload - the data to be signed
   * @param address - optional, if not provided, the first staking address will be used
   * @returns a signature
   */
  async signData(payload: string, address?: string): Promise<DataSignature> {
    if (address === undefined) {
      address = (await this.getUsedAddresses())[0]!;
    }
    const signerAddress = toAddress(address).toBytes().toString();

    // todo TW process this witness set and return DataSignature correctly

    return this._walletInstance.signData(signerAddress, fromUTF8(payload));
  }

  /**
   * Requests user to sign the provided transaction (tx). The wallet should ask the user for permission, and if given, try to sign the supplied body and return a signed transaction. partialSign should be true if the transaction provided requires multiple signatures.
   *
   * @param unsignedTx - a transaction in CBOR
   * @param partialSign - if the transaction is signed partially
   * @returns a signed transaction in CBOR
   */
  async signTx(unsignedTx: string, partialSign = false): Promise<string> {
    const witness = await this._walletInstance.signTx(unsignedTx, partialSign);
    if (witness === "") {
      return unsignedTx;
    }
    return BrowserWallet.addBrowserWitnesses(unsignedTx, witness);
  }

  /**
   * Experimental feature - sign multiple transactions at once (Supported wallet(s): Typhon)
   *
   * @param unsignedTxs - array of unsigned transactions in CborHex string
   * @param partialSign - if the transactions are signed partially
   * @returns array of signed transactions CborHex string
   */
  async signTxs(unsignedTxs: string[], partialSign = false): Promise<string[]> {
    let witnessSets: string[] | undefined = undefined;
    // Hardcoded behavior customized for different wallet for now as there is no standard confirmed
    switch (this._walletName) {
      case "Typhon Wallet":
        if (this._walletInstance.signTxs) {
          witnessSets = await this._walletInstance.signTxs(
            unsignedTxs,
            partialSign,
          );
        }
        break;
      default:
        if (this._walletInstance.signTxs) {
          witnessSets = await this._walletInstance.signTxs(
            unsignedTxs.map((cbor) => ({
              cbor,
              partialSign,
            })),
          );
        } else if (this._walletInstance.experimental.signTxs) {
          witnessSets = await this._walletInstance.experimental.signTxs(
            unsignedTxs.map((cbor) => ({
              cbor,
              partialSign,
            })),
          );
        }
        break;
    }

    if (!witnessSets) throw new Error("Wallet does not support signTxs");

    const signedTxs: string[] = [];
    for (let i = 0; i < witnessSets.length; i++) {
      const unsignedTx = unsignedTxs[i]!;
      const cWitness = witnessSets[i]!;
      if (cWitness === "") {
        // It's possible that txs are signed just to give
        // browser wallet the tx context
        signedTxs.push(unsignedTx);
      } else {
        const signedTx = BrowserWallet.addBrowserWitnesses(
          unsignedTx,
          cWitness,
        );
        signedTxs.push(signedTx);
      }
    }

    return signedTxs;
  }

  /**
   * Submits the signed transaction to the blockchain network.
   *
   * As wallets should already have this ability to submit transaction, we allow dApps to request that a transaction be sent through it. If the wallet accepts the transaction and tries to send it, it shall return the transaction ID for the dApp to track. The wallet can return error messages or failure if there was an error in sending it.
   *
   * @param tx
   * @returns a transaction hash
   */
  submitTx(tx: string): Promise<string> {
    return this._walletInstance.submitTx(tx);
  }

  /**
   * Get a used address of type Address from the wallet.
   *
   * This is used in transaction building.
   *
   * @returns an Address object
   */
  async getUsedAddress(): Promise<Address> {
    const usedAddresses = await this._walletInstance.getUsedAddresses();
    if (usedAddresses.length === 0) throw new Error("No used addresses found");
    return deserializeAddress(usedAddresses[0]!);
  }

  /**
   * Get a list of UTXOs to be used as collateral inputs for transactions with plutus script inputs.
   *
   * This is used in transaction building.
   *
   * @returns a list of UTXOs
   */
  async getCollateralUnspentOutput(
    limit = DEFAULT_PROTOCOL_PARAMETERS.maxCollateralInputs,
  ): Promise<TransactionUnspentOutput[]> {
    let collateral: string[] = [];
    try {
      collateral = (await this._walletInstance.getCollateral()) ?? [];
    } catch (e) {
      try {
        collateral =
          (await this._walletInstance.experimental.getCollateral()) ?? [];
      } catch (e) {
        console.error(e);
      }
    }
    return collateral.map((c) => deserializeTxUnspentOutput(c)).slice(0, limit);
  }

  /**
   * Get a list of UTXOs to be used for transaction building.
   *
   * This is used in transaction building.
   *
   * @returns a list of UTXOs
   */
  async getUsedUTxOs(): Promise<TransactionUnspentOutput[]> {
    const utxos = (await this._walletInstance.getUtxos()) ?? [];
    return utxos.map((u) => deserializeTxUnspentOutput(u));
  }

  /**
   * A helper function to get the assets in the wallet.
   *
   * @returns a list of assets
   */
  async getAssets(): Promise<AssetExtended[]> {
    const balance = await this.getBalance();
    return balance
      .filter((v) => v.unit !== "lovelace")
      .map((v) => {
        const policyId = v.unit.slice(0, POLICY_ID_LENGTH);
        const assetName = v.unit.slice(POLICY_ID_LENGTH);
        const fingerprint = resolveFingerprint(policyId, assetName);

        return {
          unit: v.unit,
          policyId,
          assetName,
          fingerprint,
          quantity: v.quantity,
        };
      });
  }

  /**
   * A helper function to get the lovelace balance in the wallet.
   *
   * @returns lovelace balance
   */
  async getLovelace(): Promise<string> {
    const balance = await this.getBalance();
    const nativeAsset = balance.find((v) => v.unit === "lovelace");

    return nativeAsset !== undefined ? nativeAsset.quantity : "0";
  }

  /**
   * A helper function to get the assets of a specific policy ID in the wallet.
   *
   * @param policyId
   * @returns a list of assets
   */
  async getPolicyIdAssets(policyId: string): Promise<AssetExtended[]> {
    const assets = await this.getAssets();
    return assets.filter((v) => v.policyId === policyId);
  }

  /**
   * A helper function to get the policy IDs of all the assets in the wallet.
   *
   * @returns a list of policy IDs
   */
  async getPolicyIds(): Promise<string[]> {
    const balance = await this.getBalance();
    return Array.from(
      new Set(balance.map((v) => v.unit.slice(0, POLICY_ID_LENGTH))),
    ).filter((p) => p !== "lovelace");
  }

  /**
   * The connected wallet account provides the account's public DRep Key, derivation as described in CIP-0105.
   * These are used by the client to identify the user's on-chain CIP-1694 interactions, i.e. if a user has registered to be a DRep.
   *
   * @returns wallet account's public DRep Key
   */
  async getDRep(): Promise<
    | {
        publicKey: string;
        publicKeyHash: string;
        dRepIDCip105: string;
      }
    | undefined
  > {
    try {
      if (this._walletInstance.cip95 === undefined) return undefined;

      const dRepKey = await this._walletInstance.cip95.getPubDRepKey();
      const { dRepIDHash } = await BrowserWallet.dRepKeyToDRepID(dRepKey);

      // const networkId = await this.getNetworkId();
      // const dRepId = buildDRepID(dRepKey, networkId); // todo: this is not correct

      const csldRepIdKeyHash = csl.PublicKey.from_hex(dRepKey).hash(); // todo: need to replace CST
      const dRepId = csldRepIdKeyHash.to_bech32("drep");

      return {
        publicKey: dRepKey,
        publicKeyHash: dRepIDHash,
        dRepIDCip105: dRepId,
      };
    } catch (e) {
      console.error(e);
      return undefined;
    }
  }

  /**
   * The connected wallet account provides the account's public DRep Key, derivation as described in CIP-0105.
   * These are used by the client to identify the user's on-chain CIP-1694 interactions, i.e. if a user has registered to be a DRep.
   *
   * @returns wallet account's public DRep Key
   */
  async getPubDRepKey(): Promise<
    | {
        pubDRepKey: string;
        dRepIDHash: string;
        dRepIDBech32: string;
      }
    | undefined
  > {
    try {
      if (this._walletInstance.cip95 === undefined) return undefined;

      const dRepKey = await this._walletInstance.cip95.getPubDRepKey();
      const { dRepIDHash } = await BrowserWallet.dRepKeyToDRepID(dRepKey);

      // const networkId = await this.getNetworkId();
      // const dRepId = buildDRepID(dRepKey, networkId); // todo: this is not correct

      const csldRepIdKeyHash = csl.PublicKey.from_hex(dRepKey).hash(); // todo: need to replace CST
      const dRepId = csldRepIdKeyHash.to_bech32("drep");

      return {
        pubDRepKey: dRepKey,
        dRepIDHash: dRepIDHash,
        dRepIDBech32: dRepId,
      };
    } catch (e) {
      console.error(e);
      return undefined;
    }
  }

  async getRegisteredPubStakeKeys(): Promise<
    | {
        pubStakeKeys: string[];
        pubStakeKeyHashes: string[];
      }
    | undefined
  > {
    try {
      if (this._walletInstance.cip95 === undefined) return undefined;

      const pubStakeKeys =
        await this._walletInstance.cip95.getRegisteredPubStakeKeys();

      const pubStakeKeyHashes = await Promise.all(
        pubStakeKeys.map(async (pubStakeKey) => {
          const { dRepIDHash } =
            await BrowserWallet.dRepKeyToDRepID(pubStakeKey);
          return dRepIDHash;
        }),
      );

      return {
        pubStakeKeys: pubStakeKeys,
        pubStakeKeyHashes: pubStakeKeyHashes,
      };
    } catch (e) {
      console.error(e);
      return undefined;
    }
  }

  async getUnregisteredPubStakeKeys(): Promise<
    | {
        pubStakeKeys: string[];
        pubStakeKeyHashes: string[];
      }
    | undefined
  > {
    try {
      if (this._walletInstance.cip95 === undefined) return undefined;

      const pubStakeKeys =
        await this._walletInstance.cip95.getUnregisteredPubStakeKeys();

      const pubStakeKeyHashes = await Promise.all(
        pubStakeKeys.map(async (pubStakeKey) => {
          const { dRepIDHash } =
            await BrowserWallet.dRepKeyToDRepID(pubStakeKey);
          return dRepIDHash;
        }),
      );

      return {
        pubStakeKeys: pubStakeKeys,
        pubStakeKeyHashes: pubStakeKeyHashes,
      };
    } catch (e) {
      console.error(e);
      return undefined;
    }
  }

  private static async dRepKeyToDRepID(dRepKey: string): Promise<{
    dRepKeyHex: Ed25519PublicKeyHex;
    dRepID: Ed25519PublicKey;
    dRepIDHash: Ed25519KeyHashHex;
  }> {
    const dRepKeyHex = Ed25519PublicKeyHex(dRepKey);
    const dRepID = Ed25519PublicKey.fromHex(dRepKeyHex);
    const dRepIDHash = (await dRepID.hash()).hex();
    return {
      dRepKeyHex,
      dRepID,
      dRepIDHash,
    };
  }

  private static resolveInstance(
    walletName: string,
    extensions: number[] = [],
  ) {
    if (window.cardano === undefined) return undefined;
    if (window.cardano[walletName] === undefined) return undefined;

    const wallet = window.cardano[walletName];

    if (extensions.length > 0) {
      const _extensions = extensions.map((e) => ({ cip: e }));
      return wallet.enable({ extensions: _extensions });
    } else {
      return wallet?.enable();
    }
  }

  static addBrowserWitnesses(unsignedTx: string, witnesses: string) {
    const cWitness = Serialization.TransactionWitnessSet.fromCbor(
      CardanoSDKUtil.HexBlob(witnesses),
    )
      .vkeys()
      ?.values();

    if (cWitness === undefined) {
      return unsignedTx;
    }

    let tx = deserializeTx(unsignedTx);
    // let tx = Transaction.fromCbor(CardanoSDK.TxCBOR(txHex));
    let witnessSet = tx.witnessSet();
    let witnessSetVkeys = witnessSet.vkeys();
    let witnessSetVkeysValues: Serialization.VkeyWitness[] = witnessSetVkeys
      ? [...witnessSetVkeys.values(), ...cWitness]
      : [...cWitness];
    witnessSet.setVkeys(
      Serialization.CborSet.fromCore(
        witnessSetVkeysValues.map((vkw) => vkw.toCore()),
        VkeyWitness.fromCore,
      ),
    );

    return new Transaction(tx.body(), witnessSet, tx.auxiliaryData()).toCbor();
  }

  static getSupportedExtensions(wallet: string) {
    const _supportedExtensions = window?.cardano?.[wallet]?.supportedExtensions;
    if (_supportedExtensions) return _supportedExtensions;
    else return [];
  }
}
