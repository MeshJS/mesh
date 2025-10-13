import { Serialization } from "@cardano-sdk/core";
import { HexBlob } from "@cardano-sdk/util";

import { BaseBip32 } from "../../bip32/base-bip32";
import { ISigner } from "../../interfaces/signer";
import { DEFAULT_ACCOUNT_KEY_DERIVATION_PATH } from "../../utils/constants";

export class CardanoSigner {
  public paymentSigner: ISigner;
  public stakeSigner?: ISigner;
  public drepSigner?: ISigner;

  constructor(
    paymentSigner: ISigner,
    stakeSigner?: ISigner,
    drepSigner?: ISigner,
  ) {
    this.paymentSigner = paymentSigner;
    this.stakeSigner = stakeSigner;
    this.drepSigner = drepSigner;
  }

  static fromBip32(
    bip32: BaseBip32,
    accountDerivationPath?: number[],
  ): CardanoSigner {
    const accountBip32 = accountDerivationPath
      ? bip32.derive(accountDerivationPath)
      : bip32.derive(DEFAULT_ACCOUNT_KEY_DERIVATION_PATH);

    return new CardanoSigner(
      accountBip32.derive([0, 0]).toSigner(),
      accountBip32.derive([2, 0]).toSigner(),
      accountBip32.derive([3, 0]).toSigner(),
    );
  }

  paymentSign(data: string): string {
    return this.paymentSigner.sign(data);
  }

  paymentSignTx(tx: string): string {
    return this.signerSignTx(tx, this.paymentSigner);
  }

  stakeSign(data: string): string {
    if (!this.stakeSigner) {
      throw new Error("Stake signer not provided");
    }
    return this.stakeSigner.sign(data);
  }

  stakeSignTx(tx: string): string {
    if (!this.stakeSigner) {
      throw new Error("Stake signer not provided");
    }
    return this.signerSignTx(tx, this.stakeSigner);
  }

  drepSign(data: string): string {
    if (!this.drepSigner) {
      throw new Error("DRep signer not provided");
    }
    return this.drepSigner.sign(data);
  }

  drepSignTx(tx: string): string {
    if (!this.drepSigner) {
      throw new Error("DRep signer not provided");
    }
    return this.signerSignTx(tx, this.drepSigner);
  }

  private signerSignTx(tx: string, signer: ISigner): string {
    const cardanoTx = Serialization.Transaction.fromCbor(tx);
    const txHash = cardanoTx.body().hash();

    const vkeyWitness = new Serialization.VkeyWitness(
      signer.getPublicKey(),
      signer.sign(HexBlob(txHash)),
    );
    return vkeyWitness.toCbor();
  }
}
