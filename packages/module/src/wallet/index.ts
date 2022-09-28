export * from './browser.service';
export * from './embedded.service';
export * from './mina.service';
export * from './node.service';

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
