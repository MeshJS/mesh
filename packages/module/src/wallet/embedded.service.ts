import { generateMnemonic, mnemonicToEntropy } from 'bip39';
import { customAlphabet } from 'nanoid';
import { csl, deriveAccountKeys, signMessage } from '@mesh/core';
import {
  buildBaseAddress, buildBip32PrivateKey,
  buildRewardAddress, buildEnterpriseAddress,
  deserializeTx, deserializeTxHash, fromBytes,
  fromUTF8, resolveTxHash,
} from '@mesh/common/utils';
import type { Address, Message, PrivateKey, Signer } from '@mesh/core';
import type { Account } from '@mesh/common/types';

export class EmbeddedWallet {
  constructor(
    private readonly _networkId: number,
    private readonly _encryptedRootKey: string,
  ) {}

  getAccount(accountIndex: number, password: string): Account {
    return this.accountContext(accountIndex, password, (paymentKey, stakeKey) => {
      const baseAddress = buildBaseAddress(
        this._networkId, paymentKey.to_public().hash(), stakeKey.to_public().hash(),
      ).to_address().to_bech32();

      const enterpriseAddress = buildEnterpriseAddress(
        this._networkId, paymentKey.to_public().hash(),
      ).to_address().to_bech32();

      const rewardAddress = buildRewardAddress(
        this._networkId, stakeKey.to_public().hash(),
      ).to_address().to_bech32();

      return { baseAddress, enterpriseAddress, rewardAddress };
    }) as Account;
  }

  signData(
    accountIndex: number, password: string,
    address: string, payload: string,
  ): string {
    try {
      return this.accountContext(accountIndex, password, (paymentKey, stakeKey) => {
        const message: Message = { payload };

        const signer: Signer = {
          address: this.resolveAddress(address, paymentKey, stakeKey),
          key: address.startsWith('stake') ? stakeKey : paymentKey,
        };

        const {
          coseSign1: signature,
        } = signMessage(message, signer);

        return signature;
      }) as string;
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
      return this.accountContext(accountIndex, password, (paymentKey, stakeKey) => {
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
      }) as string;
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

  private accountContext(
    accountIndex: number, password: string,
    callback: (payment: PrivateKey, stake: PrivateKey) => unknown,
  ): unknown {
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

  private resolveAddress(
    bech32: string, payment: PrivateKey, stake: PrivateKey,
  ): Address {
    const address = [
      buildBaseAddress(this._networkId, payment.to_public().hash(), stake.to_public().hash()),
      buildEnterpriseAddress(this._networkId, payment.to_public().hash()),
      buildRewardAddress(this._networkId, stake.to_public().hash()),
    ].find((a) => a.to_address().to_bech32() ===  bech32);

    if (address !== undefined)
      return address.to_address();

    throw new Error(`Address: ${bech32} doesn't belong to this account.`);
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
