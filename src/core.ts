// import * as lib from "@emurgo/cardano-serialization-lib-browser";
// import {
//   BigNum,
//   Value,
//   Address,
//   min_ada_required,
//   TransactionUnspentOutput,
//   Transaction,
//   Vkeywitnesses,
//   NativeScripts,
//   TransactionWitnessSet,
//   AuxiliaryData,
//   GeneralTransactionMetadata,
//   encode_json_str_to_metadatum,
//   Bip32PrivateKey,
//   encrypt_with_password,
//   decrypt_with_password,
//   BaseAddress,
//   // NetworkInfo,
//   StakeCredential,
//   hash_transaction,
//   make_vkey_witness,
// } from "@emurgo/cardano-serialization-lib-browser";
import SerializationLib from "./provider/serializationlib.js";

import {
  generateMnemonic,
  mnemonicToEntropy,
} from "bip39";
import cryptoRandomString from "crypto-random-string";

import { HexToAscii, toHex, fromHex, harden } from "./utils/converter.js";
import { WalletApi, Asset } from "./types/types.js";
import { MIN_ADA_REQUIRED, TxSignError } from "./global.js";

export class Core {
  private _provider: WalletApi; // wallet provider on the browser, i.e. window.cardano.ccvault
  private _cardano; // Serialization Lib
  private _selectedNetwork: number;

  constructor() {}

  async init({ network }: { network: number }) {
    await SerializationLib.load();
    this._cardano = await SerializationLib.Instance;
    this._selectedNetwork = network;
  }

  getCardano() {
    return this._cardano;
  }

  _checkWallet() {
    if (this._provider == null) {
      throw "Wallet not connected.";
    }
  }

  fromCborToHex({ cbor }: { cbor: string }) {
    return this._cardano.Value.from_bytes(fromHex(cbor));
  }

  getWalletProvider() {
    return this._provider;
  }

  async enableWallet({ walletName }: { walletName: string }): Promise<boolean> {
    if (walletName === "ccvault") {
      const instance = await window.cardano?.ccvault?.enable();
      if (instance) {
        this._provider = instance;
        return true;
      }
    } else if (walletName === "gerowallet") {
      const instance = await window.cardano?.gerowallet?.enable();
      if (instance) {
        this._provider = instance;
        return true;
      }
    } else if (walletName === "nami" || walletName === null) {
      const instance = await window.cardano?.nami?.enable();
      if (instance) {
        this._provider = instance;
        return true;
      }
      // this is old nami (`window.cardano`)
      // this._provider = window.cardano;
      // if (this._provider) {
      //   return true;
      // }
    }
    return false;
  }

  async getUsedAddresses(): Promise<string[]> {
    this._checkWallet();
    const usedAddresses = await this._provider.getUsedAddresses();
    return usedAddresses.map((address) =>
    this._cardano.Address.from_bytes(fromHex(address)).to_bech32()
    );
  }

  async getWalletAddress(): Promise<string> {
    const usedAddresses = await this.getUsedAddresses();
    return usedAddresses[0];
  }

  async getRewardAddresses(): Promise<string[]> {
    return await this._provider.getRewardAddresses();
  }

  async getUtxos(): Promise<string[] | undefined> {
    this._checkWallet();
    return await this._provider.getUtxos();
  }

  async getAvailableWallets(): Promise<string[]> {
    let availableWallets: string[] = [];
    if (window.cardano === undefined) {
      return availableWallets;
    }
    if (window.cardano.ccvault) {
      availableWallets.push("ccvault");
    }
    if (window.cardano.gerowallet) {
      availableWallets.push("gerowallet");
    }
    if (window.cardano.nami) {
      availableWallets.push("nami");
    }
    return availableWallets;
  }

  async getNetworkId(): Promise<number> {
    return await this._provider.getNetworkId();
  }

  async getAssets(): Promise<Asset[]> {
    const valueCBOR = await this._provider.getBalance();
    const value = this._cardano.Value.from_bytes(fromHex(valueCBOR));

    const assets: Asset[] = [];
    if (value.multiasset()) {
      const multiAssets = value.multiasset().keys();
      for (let j = 0; j < multiAssets.len(); j++) {
        const policy = multiAssets.get(j);
        const policyAssets = value.multiasset().get(policy);
        const assetNames = policyAssets.keys();
        for (let k = 0; k < assetNames.len(); k++) {
          const policyAsset = assetNames.get(k);
          const quantity = policyAssets.get(policyAsset);
          const asset = toHex(policy.to_bytes()) + toHex(policyAsset.name());
          const _policy = asset.slice(0, 56);
          const _name = asset.slice(56);
          assets.push({
            unit: asset,
            quantity: quantity.to_str(),
            policy: _policy,
            name: HexToAscii(_name),
          });
        }
      }
    }

    return assets;
  }

  /**
   * TODO: somehow the amount dont tally my wallet
   * TODO: need check this function and clean up
   * @param inAda
   * @returns
   */
  async getLovelace(): Promise<number> {
    const utxos = await this._provider.getUtxos();

    if (utxos !== undefined) {
      const parsedUtxos = utxos.map((utxo) =>
      this._cardano.TransactionUnspentOutput.from_bytes(Buffer.from(utxo, "hex"))
      );

      let countedValue = this._cardano.Value.new(this._cardano.BigNum.from_str("0"));
      parsedUtxos.forEach((element) => {
        countedValue = countedValue.checked_add(element.output().amount());
      });

      const minAda = this._cardano.min_ada_required(
        countedValue,
        false,
        this._cardano.BigNum.from_str(MIN_ADA_REQUIRED.toString())
      );

      const availableAda = countedValue.coin().checked_sub(minAda);
      const lovelace = parseInt(availableAda.to_str());
      return lovelace;
    }

    return 0;
  }

  async signData({ payload }: { payload: string }): Promise<string> {
    const rewardAddress = await this.getRewardAddresses();
    const coseSign1Hex = await this._provider.signData(
      rewardAddress[0],
      payload
    );
    return coseSign1Hex;
  }

  async signTx({
    tx,
    partialSign = false,
  }: {
    tx: string;
    partialSign?: boolean;
  }): Promise<string> {
    return await this._provider.signTx(tx, partialSign);
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
    let transaction = this._cardano.Transaction.from_bytes(Buffer.from(tx, "hex"));

    const txWitnesses = transaction.witness_set();
    const txVkeys = txWitnesses.vkeys();
    const txScripts = txWitnesses.native_scripts();

    const totalVkeys = this._cardano.Vkeywitnesses.new();
    const totalScripts = this._cardano.NativeScripts.new();

    for (let witness of witnesses) {
      const addWitnesses = this._cardano.TransactionWitnessSet.from_bytes(
        Buffer.from(witness, "hex")
      );
      const addVkeys = addWitnesses.vkeys();
      if (addVkeys) {
        for (let i = 0; i < addVkeys.len(); i++) {
          totalVkeys.add(addVkeys.get(i));
        }
      }
    }

    if (txVkeys) {
      for (let i = 0; i < txVkeys.len(); i++) {
        totalVkeys.add(txVkeys.get(i));
      }
    }
    if (txScripts) {
      for (let i = 0; i < txScripts.len(); i++) {
        totalScripts.add(txScripts.get(i));
      }
    }

    const totalWitnesses = this._cardano.TransactionWitnessSet.new();
    totalWitnesses.set_vkeys(totalVkeys);
    totalWitnesses.set_native_scripts(totalScripts);
    let aux;
    if (metadata) {
      aux = this._cardano.AuxiliaryData.new();
      const generalMetadata = this._cardano.GeneralTransactionMetadata.new();
      Object.entries(metadata).map(([MetadataLabel, Metadata]) => {
        generalMetadata.insert(
          this._cardano.BigNum.from_str(MetadataLabel),
          this._cardano.encode_json_str_to_metadatum(JSON.stringify(Metadata), 0)
        );
      });

      aux.set_metadata(generalMetadata);
    } else {
      aux = transaction.auxiliary_data();
    }
    const signedTx = await this._cardano.Transaction.new(
      transaction.body(),
      totalWitnesses,
      aux
    );

    // const txhash = await this._blockfrostRequest({
    //   endpoint: `/tx/submit`,
    //   headers: {
    //     "Content-Type": "application/cbor",
    //   },
    //   body: Buffer.from(signedTx.to_bytes(), "hex"),
    //   networkId: networkId,
    //   method: "POST",
    // });

    const txHash = await this._provider.submitTx(toHex(signedTx.to_bytes()));

    return txHash;
  }

  mnemonicToObject = (mnemonic) => {
    const mnemonicMap = {};
    mnemonic
      .split(" ")
      .forEach((word, index) => (mnemonicMap[index + 1] = word));
    return mnemonicMap;
  };

  encryptWithPassword = async (password, rootKeyBytes) => {
    const rootKeyHex = Buffer.from(rootKeyBytes, "hex").toString("hex");
    const passwordHex = Buffer.from(password).toString("hex");
    const salt = cryptoRandomString({ length: 2 * 32 });
    const nonce = cryptoRandomString({ length: 2 * 12 });
    return this._cardano.encrypt_with_password(passwordHex, salt, nonce, rootKeyHex);
  };

  decryptWithPassword = async (password, encryptedKeyHex) => {
    const passwordHex = Buffer.from(password).toString("hex");
    let decryptedHex;
    try {
      decryptedHex = this._cardano.decrypt_with_password(passwordHex, encryptedKeyHex);
    } catch (err) {
      throw TxSignError.WrongPassword;
    }
    return decryptedHex;
  };

  requestAccountKey = async (encryptedRootKey, password, accountIndex = 1) => {
    let accountKey = this._cardano.Bip32PrivateKey.from_bytes(
      Buffer.from(
        await this.decryptWithPassword(password, encryptedRootKey),
        "hex"
      )
    )
      .derive(harden(1852)) // purpose
      .derive(harden(1815)) // coin type;
      .derive(harden(accountIndex));

    return {
      accountKey,
      paymentKey: accountKey.derive(0).derive(0).to_raw_key(),
      stakeKey: accountKey.derive(2).derive(0).to_raw_key(),
    };
  };

  async newMnemonic() {
    const mnemonic = generateMnemonic(256);
    const mnemonicMap = this.mnemonicToObject(mnemonic);
    return { mnemonic, mnemonicMap };
  }

  async createWalletMnemonic({ seedPhrase, password }) {
    let entropy = mnemonicToEntropy(seedPhrase);
    console.log("entropy", entropy);

    let rootKey = this._cardano.Bip32PrivateKey.from_bip39_entropy(
      Buffer.from(entropy, "hex"),
      Buffer.from("")
    );
    console.log("rootKey", rootKey);

    const encryptedRootKey = await this.encryptWithPassword(
      password,
      rootKey.as_bytes()
    );
    console.log("encryptedRootKey", encryptedRootKey);

    return await this.loadWallet({ encryptedRootKey, password });
  }

  async loadWallet({ encryptedRootKey, password, accountIndex = 1 }) {
    let accountKeys = await this.requestAccountKey(
      encryptedRootKey,
      password,
      accountIndex
    );

    const paymentKeyHash = accountKeys.paymentKey.to_public().hash();
    const stakeKeyHash = accountKeys.stakeKey.to_public().hash();

    const paymentAddr = this._cardano.BaseAddress.new(
      this._selectedNetwork,
      this._cardano.StakeCredential.from_keyhash(paymentKeyHash),
      this._cardano.StakeCredential.from_keyhash(stakeKeyHash)
    )
      .to_address()
      .to_bech32();

    return { paymentKeyHash, stakeKeyHash, paymentAddr };
  }

  async signTxWithPassword({
    tx,
    encryptedRootKey,
    password,
    accountIndex = 1,
    partialSign = false,
  }) {
    let { paymentKey, stakeKey } = await this.requestAccountKey(
      encryptedRootKey,
      password,
      accountIndex
    );

    const paymentKeyHash = paymentKey.to_public().hash();
    const stakeKeyHash = stakeKey.to_public().hash();

    const rawTx = this._cardano.Transaction.from_bytes(Buffer.from(tx, "hex"));

    const txWitnessSet = this._cardano.TransactionWitnessSet.new();
    const vkeyWitnesses = this._cardano.Vkeywitnesses.new();
    const txHash = this._cardano.hash_transaction(rawTx.body());

    let keyHashes = [paymentKeyHash, stakeKeyHash];

    keyHashes.forEach((keyHash) => {
      let signingKey;
      if (keyHash === paymentKeyHash) signingKey = paymentKey;
      else if (keyHash === stakeKeyHash) signingKey = stakeKey;
      else if (!partialSign) throw TxSignError.ProofGeneration;
      else return;
      const vkey = this._cardano.make_vkey_witness(txHash, signingKey);
      vkeyWitnesses.add(vkey);
    });

    txWitnessSet.set_vkeys(vkeyWitnesses);
    return txWitnessSet;
  }
}
