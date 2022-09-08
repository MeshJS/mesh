import { generateMnemonic, mnemonicToEntropy } from 'bip39';
import { customAlphabet } from 'nanoid';
import { csl, deriveAccountKeys, signMessage } from '@mesh/core';
import {
  buildBaseAddress, buildBip32PrivateKey, buildRewardAddress,
  buildEnterpriseAddress, deserializeTx, deserializeTxHash,
  fromBytes, fromUTF8, resolveTxHash,
} from '@mesh/common/utils';
import type { Message, PrivateKey, Signer } from '@mesh/core';

export class EmbeddedWallet {
  constructor(
    private readonly _networkId: number,
    private readonly _encryptedRootKey: string,
  ) {}

  signData(
    accountIndex: number, password: string,
    address: string, payload: string,
  ): string {
    try {
      return this.signContext(accountIndex, password, (paymentKey, stakeKey) => {
        const message: Message = { payload };

        const signer: Signer = {
          address: this.resolveAddress(address, paymentKey, stakeKey),
          key: address.startsWith('stake') ? stakeKey : paymentKey,
        };

        const {
          coseSign1: signature,
        } = signMessage(message, signer);

        return signature;
      });
    } catch (error) {
      throw new Error(`An error occurred during signData: ${error}.`);
    }
  }

  signTx(
    accountIndex: number, password: string,
    unsignedTx: string, txSigners: string[],
    partialSign: boolean,
  ): string {
    try {
      return this.signContext(accountIndex, password, (paymentKey, stakeKey) => {
        const signatures = csl.Vkeywitnesses.new();
        const txWitnesses = csl.TransactionWitnessSet.new();
        const txBody = deserializeTx(unsignedTx).body().to_hex();
        const txHash = deserializeTxHash(resolveTxHash(txBody));

        txSigners.forEach((skh: string) => {
          if (skh === paymentKey.to_public().hash().to_hex()) {
            signatures.add(csl.make_vkey_witness(txHash, paymentKey));
          } else if (skh === stakeKey.to_public().hash().to_hex()) {
            signatures.add(csl.make_vkey_witness(txHash, stakeKey));
          } else if (partialSign === false) {
            throw new Error(`Missing key witness for: ${skh}`);
          }
        });

        txWitnesses.set_vkeys(signatures);
        return txWitnesses.to_hex();
      });
    } catch (error) {
      throw new Error(`An error occurred during signTx: ${error}.`);
    }
  }

  static encryptMnemonic(words: string[], password: string): string {
    const entropy = mnemonicToEntropy(words.join(' '));
    const bip32PrivateKey = buildBip32PrivateKey(entropy);
    const cborBip32PrivateKey = fromBytes(bip32PrivateKey.as_bytes());

    bip32PrivateKey.free();

    return EmbeddedWallet.encrypt(cborBip32PrivateKey, password);
  }

  static encryptPrivateKey(bech32: string, password: string): string {
    const bip32PrivateKey = csl.Bip32PrivateKey.from_bech32(bech32);
    const cborBip32PrivateKey = fromBytes(bip32PrivateKey.as_bytes());

    bip32PrivateKey.free();

    return EmbeddedWallet.encrypt(cborBip32PrivateKey, password);
  }

  static generateMnemonic(strength = 256): string[] {
    const mnemonic = generateMnemonic(strength);
    return mnemonic.split(' ');
  }

  private resolveAddress(
    bech32: string, payment: PrivateKey, stake: PrivateKey,
  ) {
    const address = [
      buildBaseAddress(this._networkId, payment.to_public().hash(), stake.to_public().hash()),
      buildEnterpriseAddress(this._networkId, payment.to_public().hash()),
      buildRewardAddress(this._networkId, stake.to_public().hash()),
    ].find((a) => a.to_address().to_bech32() ===  bech32);

    if (address !== undefined)
      return address.to_address();

    throw new Error(`Address: ${bech32} doesn't belong to this account.`);
  }

  private signContext(
    accountIndex: number, password: string,
    callback: (payment: PrivateKey, stake: PrivateKey) => string,
  ): string {
    const rootKey = EmbeddedWallet.decrypt(
      this._encryptedRootKey, password,
    );

    const { paymentKey, stakeKey } =
      deriveAccountKeys(rootKey, accountIndex);

    const result = callback(paymentKey, stakeKey);

    paymentKey.free();
    stakeKey.free();

    return result;
  }

  private static decrypt(data: string, password: string): string {
    try {
      return csl.decrypt_with_password(
        fromUTF8(password), data,
      );
    } catch (error) {
      throw new Error('The password is incorrect.');
    }
  }

  private static encrypt(data: string, password: string): string {
    const generateRandomHex = customAlphabet('0123456789abcdef');
    const salt = generateRandomHex(64);
    const nonce = generateRandomHex(24);
    return csl.encrypt_with_password(
      fromUTF8(password), salt, nonce, data,
    );
  }
}

  /*static encryptSigningKeys(
    cborPaymentKey: string,
    cborStakeKey: string,
    password: string,
  ): string {
    const encryptedPaymentKey = EmbeddedWallet.encrypt(
      cborPaymentKey.slice(4), password,
    );

    const encryptedStakeKey = EmbeddedWallet.encrypt(
      cborStakeKey.slice(4), password,
    );

    return `${encryptedPaymentKey}|${encryptedStakeKey}`;
  }

  private decryptAccountKeys(password: string) {
    if (this._walletKeyType === 'ACCOUNT') {
      const accountKeys = this._encryptedWalletKey.split('|');

      const cborPayment = EmbeddedWallet
        .decrypt(accountKeys[0], password);

      const cborStake = EmbeddedWallet
        .decrypt(accountKeys[1], password);

      const paymentKey =
        csl.PrivateKey.from_hex(cborPayment);

      const stakeKey =
        csl.PrivateKey.from_hex(cborStake);

      return { paymentKey, stakeKey };
    }

    const rootKey = EmbeddedWallet
      .decrypt(this._encryptedWalletKey, password);

    const { paymentKey, stakeKey } = deriveAccountKeys(
      rootKey, this._accountIndex
    );

    return { paymentKey, stakeKey };
  }

  async getMintingPolicy(password: string, policyIndex = 0) {
    if (this._walletKeyType === 'ROOT') {
      const rootKey = EmbeddedWallet.decrypt(
        this._encryptedWalletKey,
        password
      );

      const policyKey = derivePolicyKey(rootKey, policyIndex);

      const forgingKeyHash = policyKey.to_public().hash();

      const nativeScripts = csl.NativeScripts.new();
      const script = csl.ScriptPubkey.new(forgingKeyHash);
      const nativeScript = csl.NativeScript.new_script_pubkey(script);

      nativeScripts.add(nativeScript);

      const forgingScript = csl.NativeScript.new_script_all(
        csl.ScriptAll.new(nativeScripts)
      );

      return {
        forgingScript: fromBytes(forgingScript.to_bytes()),
        forgingKeyHash: fromBytes(forgingKeyHash.to_bytes()),
        forgingScriptHash: fromBytes(forgingScript.hash().to_bytes()),
      };
    }

    throw new Error('TBD...');
  }*/
