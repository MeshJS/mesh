import { BaseBip32 } from "../../bip32/base-bip32";
import { ISigner } from "../../interfaces/signer";
import {
  DEFAULT_ACCOUNT_KEY_DERIVATION_PATH,
  HARDENED_OFFSET,
} from "../../utils/constants";

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

  static fromBip32(bip32: BaseBip32): CardanoSigner {
    const accountBip32 = bip32.derive(DEFAULT_ACCOUNT_KEY_DERIVATION_PATH);

    return new CardanoSigner(
      accountBip32.derive([0, 0]).toSigner(),
      accountBip32.derive([2, 0]).toSigner(),
      accountBip32.derive([3, 0]).toSigner(),
    );
  }

  paymentSign(data: string): string {
    return this.paymentSigner.sign(data);
  }

  stakeSign(data: string): string {
    if (!this.stakeSigner) {
      throw new Error("Stake signer not provided");
    }
    return this.stakeSigner.sign(data);
  }

  drepSign(data: string): string {
    if (!this.drepSigner) {
      throw new Error("DRep signer not provided");
    }
    return this.drepSigner.sign(data);
  }
}
