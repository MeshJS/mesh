import { Serialization, setInConwayEra } from "@cardano-sdk/core";
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
    setInConwayEra(true);
    this.paymentSigner = paymentSigner;
    this.stakeSigner = stakeSigner;
    this.drepSigner = drepSigner;
  }

  static async fromBip32(
    bip32: BaseBip32,
    accountDerivationPath?: number[],
  ): Promise<CardanoSigner> {
    const accountBip32 = accountDerivationPath
      ? await bip32.derive(accountDerivationPath)
      : await bip32.derive(DEFAULT_ACCOUNT_KEY_DERIVATION_PATH);

    const paymentAccount = await accountBip32.derive([0, 0]);
    const stakeAccount = await accountBip32.derive([2, 0]);
    const drepAccount = await accountBip32.derive([3, 0]);

    return new CardanoSigner(
      await paymentAccount.toSigner(),
      await stakeAccount.toSigner(),
      await drepAccount.toSigner(),
    );
  }

  async paymentSign(data: string): Promise<string> {
    return this.paymentSigner.sign(data);
  }

  async paymentSignTx(tx: string): Promise<string> {
    return this.signerSignTx(tx, this.paymentSigner);
  }

  async stakeSign(data: string): Promise<string> {
    if (!this.stakeSigner) {
      throw new Error("Stake signer not provided");
    }
    return this.stakeSigner.sign(data);
  }

  async stakeSignTx(tx: string): Promise<string> {
    if (!this.stakeSigner) {
      throw new Error("Stake signer not provided");
    }
    return this.signerSignTx(tx, this.stakeSigner);
  }

  async drepSign(data: string): Promise<string> {
    if (!this.drepSigner) {
      throw new Error("DRep signer not provided");
    }
    return this.drepSigner.sign(data);
  }

  async drepSignTx(tx: string): Promise<string> {
    if (!this.drepSigner) {
      throw new Error("DRep signer not provided");
    }
    return this.signerSignTx(tx, this.drepSigner);
  }

  private async signerSignTx(tx: string, signer: ISigner): Promise<string> {
    const cardanoTx = Serialization.Transaction.fromCbor(tx);
    const txHash = cardanoTx.body().hash();

    const vkeyWitness = new Serialization.VkeyWitness(
      await signer.getPublicKey(),
      await signer.sign(HexBlob(txHash)),
    );
    return vkeyWitness.toCbor();
  }
}
