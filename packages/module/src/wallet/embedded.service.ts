import cryptoRandomString from 'crypto-random-string';
import { generateMnemonic, mnemonicToEntropy } from 'bip39';
import { csl } from '@mesh/core';
import {
  buildBaseAddress, buildBip32PrivateKey, buildRewardAddress,
  deserializeBip32PrivateKey, deserializeTx, deserializeTxHash,
  deserializeTxWitnessSet, fromBytes, fromUTF8, resolveTxHash,
} from '@mesh/common/utils';
import type { BaseAddress, RewardAddress } from '@mesh/core';

export class EmbeddedWallet {
  private readonly _accountIndex: number;
  private readonly _baseAddress: BaseAddress;
  private readonly _rewardAddress: RewardAddress;
  private readonly _walletKeyType: PrivateKeyType;

  constructor(
    private readonly _encryptedWalletKey: string, password: string,
    options = {} as Partial<CreateEmbeddedWalletOptions>,
  ) {
    try {
      this._accountIndex = options.accountIndex ?? 0;
      this._walletKeyType =
        this._encryptedWalletKey.split('|').length > 1
          ? 'ACCOUNT'
          : 'ROOT';

      const {
        paymentKey, stakeKey,
      } = this.decryptAccountKeys(password);

      const networkId =
        options.networkId ?? csl.NetworkInfo.testnet().network_id();

      this._baseAddress = buildBaseAddress(
        networkId,
        paymentKey.to_public().hash(),
        stakeKey.to_public().hash(),
      );

      this._rewardAddress = buildRewardAddress(
        networkId, stakeKey.to_public().hash(),
      );

      paymentKey.free();
      stakeKey.free();
    } catch (error) {
      throw error;
    }
  }

  get paymentAddress(): string {
    return this._baseAddress
      .to_address()
      .to_bech32();
  }

  get stakeAddress(): string {
    return this._rewardAddress
      .to_address()
      .to_bech32();
  }

  /*async getMintingPolicy(password: string, policyIndex = 0) {
    if (this._walletKeyType === 'ROOT') {
      const rootKey = EmbeddedWallet.decrypt(
        this._encryptedWalletKey, password,
      );

      const policyKey = EmbeddedWallet
        .derivePolicyKey(rootKey, policyIndex);

      const forgingKeyHash = policyKey.to_public().hash();

      const nativeScripts = csl.NativeScripts.new();
      const script = csl.ScriptPubkey.new(forgingKeyHash);
      const nativeScript = csl.NativeScript.new_script_pubkey(script);

      nativeScripts.add(nativeScript);

      const forgingScript = csl.NativeScript.new_script_all(
        csl.ScriptAll.new(nativeScripts),
      );

      return {
        forgingScript: fromBytes(forgingScript.to_bytes()),
        forgingKeyHash: fromBytes(forgingKeyHash.to_bytes()),
        forgingScriptHash: fromBytes(forgingScript.hash().to_bytes()),
      };
    }

    throw new Error('TBD...');
  }*/

  signData(_payload: string, _password: string): string {
    throw new Error('Method not implemented.');
  }

  signTx(unsignedTx: string, password: string): string {
    try {
      const {
        paymentKey, stakeKey,
      } = this.decryptAccountKeys(password);

      const tx = deserializeTx(unsignedTx);

      const txHash = deserializeTxHash(
        resolveTxHash(fromBytes(tx.body().to_bytes()))
      );

      const txWitnessSet = deserializeTxWitnessSet(
        fromBytes(tx.witness_set().to_bytes())
      );

      const vkeyWitnesses = csl.Vkeywitnesses.new();

      vkeyWitnesses.add(csl.make_vkey_witness(txHash, paymentKey));
      // vkeyWitnesses.add(csl.make_vkey_witness(txHash, stakeKey));

      txWitnessSet.set_vkeys(vkeyWitnesses);

      paymentKey.free();
      stakeKey.free();

      return fromBytes(
        csl.Transaction.new(
          tx.body(),
          txWitnessSet,
          tx.auxiliary_data()
        ).to_bytes()
      );
    } catch (error) {
      throw error;
    }
  }

  static encryptMnemonic(words: string[], password: string): string {
    const entropy = mnemonicToEntropy(words.join(' '));
    const bip32PrivateKey = buildBip32PrivateKey(entropy);
    const cborBip32PrivateKey = fromBytes(bip32PrivateKey.as_bytes());

    bip32PrivateKey.free();

    return EmbeddedWallet.encrypt(
      cborBip32PrivateKey, password,
    );
  }

  static encryptPrivateKey(bech32: string, password: string): string {
    const bip32PrivateKey = csl.Bip32PrivateKey.from_bech32(bech32);
    const cborBip32PrivateKey = fromBytes(bip32PrivateKey.as_bytes());

    bip32PrivateKey.free();

    return EmbeddedWallet.encrypt(
      cborBip32PrivateKey, password,
    );
  }

  static encryptSigningKeys(
    cborPaymentKey: string, cborStakeKey: string, password: string,
  ): string {
    const encryptedPaymentKey = EmbeddedWallet.encrypt(
      cborPaymentKey.slice(4), password,
    );

    const encryptedStakeKey = EmbeddedWallet.encrypt(
      cborStakeKey.slice(4), password,
    );

    return `${encryptedPaymentKey}|${encryptedStakeKey}`;
  }

  static generate(strength = 256): string[] {
    const mnemonic = generateMnemonic(strength);
    return mnemonic.split(' ');
  }

  private static decrypt(data: string, password: string): string {
    try {
      return csl.decrypt_with_password(fromUTF8(password), data);
    } catch (error) {
      throw new Error('The password is incorrect.');
    }
  }

  private static deriveAccountKeys(
    rootKey: string, accountIndex: number,
  ) {
    const bip32PrivateKey = deserializeBip32PrivateKey(rootKey);

    const accountKeys = bip32PrivateKey
      .derive(EmbeddedWallet.harden(1852)) // purpose
      .derive(EmbeddedWallet.harden(1815)) // coin type
      .derive(EmbeddedWallet.harden(accountIndex));

    const paymentKey = accountKeys
      .derive(0) // external chain
      .derive(0)
      .to_raw_key();

    const stakeKey = accountKeys
      .derive(2) // staking key
      .derive(0)
      .to_raw_key();

    accountKeys.free();
    bip32PrivateKey.free();

    return { paymentKey, stakeKey };
  }

  /*private static derivePolicyKey(
    rootKey: string, policyIndex: number,
  ) {
    const bip32PrivateKey = deserializeBip32PrivateKey(rootKey);

    const policyKey = bip32PrivateKey
      .derive(EmbeddedWallet.harden(1855)) // purpose
      .derive(EmbeddedWallet.harden(1815)) // coin type
      .derive(EmbeddedWallet.harden(policyIndex))
      .to_raw_key();

    bip32PrivateKey.free();

    return policyKey;
  }*/

  private static encrypt(data: string, password: string): string {
    const salt = cryptoRandomString({ length: 64 });
    const nonce = cryptoRandomString({ length: 24 });

    return csl.encrypt_with_password(
      fromUTF8(password), salt, nonce, data,
    );
  }

  private static harden(path: number): number {
    return 0x80000000 + path;
  }

  private decryptAccountKeys(password: string) {
    if (this._walletKeyType === 'ACCOUNT') {
      const accountKeys = this._encryptedWalletKey.split('|');

      const cborPayment = EmbeddedWallet.decrypt(
        accountKeys[0], password,
      );

      const cborStake = EmbeddedWallet.decrypt(
        accountKeys[1], password,
      );

      const paymentKey = csl.PrivateKey
        .from_hex(cborPayment);

      const stakeKey = csl.PrivateKey
        .from_hex(cborStake);

      return { paymentKey, stakeKey };
    }

    const rootKey = EmbeddedWallet.decrypt(
      this._encryptedWalletKey, password,
    );

    const {
      paymentKey, stakeKey,
    } = EmbeddedWallet.deriveAccountKeys(rootKey, this._accountIndex);

    return { paymentKey, stakeKey };
  }
}

type CreateEmbeddedWalletOptions = {
  accountIndex: number;
  networkId: number;
};

type PrivateKeyType = 'ACCOUNT' | 'ROOT';
