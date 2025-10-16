import { Serialization, setInConwayEra } from "@cardano-sdk/core";
import { Ed25519PublicKeyHex, Ed25519SignatureHex } from "@cardano-sdk/crypto";
import { HexBlob } from "@cardano-sdk/util";
import {
  CborBytes,
  CborMap,
  CborMapEntry,
  CborNegInt,
  CborText,
  CborUInt,
} from "@harmoniclabs/cbor";

import { DataSignature, isHexString, stringToHex } from "@meshsdk/common";

import { BaseBip32 } from "../../bip32/base-bip32";
import { ISigner } from "../../interfaces/signer";
import { DEFAULT_ACCOUNT_KEY_DERIVATION_PATH } from "../../utils/constants";
import { CoseSign1, getCoseKeyFromPublicKey } from "./cip-08";

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

  async paymentSignData(data: string, address: string): Promise<DataSignature> {
    return this.signerSignData(data, address, this.paymentSigner);
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

  async stakeSignData(data: string, address: string): Promise<DataSignature> {
    if (!this.stakeSigner) {
      throw new Error("Stake signer not provided");
    }
    return this.signerSignData(data, address, this.stakeSigner);
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

  async drepSignData(data: string, address: string): Promise<DataSignature> {
    if (!this.drepSigner) {
      throw new Error("DRep signer not provided");
    }
    return this.signerSignData(data, address, this.drepSigner);
  }

  private async signerSignTx(tx: string, signer: ISigner): Promise<string> {
    const cardanoTx = Serialization.Transaction.fromCbor(
      Serialization.TxCBOR(tx),
    );
    const txHash = cardanoTx.body().hash();

    const vkeyWitness = new Serialization.VkeyWitness(
      Ed25519PublicKeyHex(await signer.getPublicKey()),
      Ed25519SignatureHex(await signer.sign(HexBlob(txHash))),
    );
    return vkeyWitness.toCbor();
  }

  private async signerSignData(
    data: string,
    addressHex: string,
    signer: ISigner,
  ): Promise<DataSignature> {
    const hexData = isHexString(data) ? data : stringToHex(data);
    const payload = Buffer.from(hexData, "hex");
    const publicKey = Buffer.from(await signer.getPublicKey(), "hex");

    const protectedMap: CborMapEntry[] = [];
    // Set protected headers as per CIP08
    // Set Algorthm used by Cardano keys
    protectedMap.push({ k: new CborUInt(1), v: new CborNegInt(-8) });
    // Set PublicKey
    protectedMap.push({ k: new CborUInt(4), v: new CborBytes(publicKey) });
    // Set Address
    protectedMap.push({
      k: new CborText("address"),
      v: new CborBytes(Buffer.from(addressHex, "hex")),
    });

    const coseSign1Builder = new CoseSign1({
      protectedMap: new CborMap(protectedMap),
      unProtectedMap: new CborMap([]),
      payload: new CborBytes(payload),
    });

    const signature = await signer.sign(
      HexBlob(
        Buffer.from(coseSign1Builder.createSigStructure()).toString("hex"),
      ),
    );

    const coseSignature = coseSign1Builder
      .buildMessage(Buffer.from(signature, "hex"))
      .toString("hex");

    return {
      key: getCoseKeyFromPublicKey(publicKey.toString("hex")).toString("hex"),
      signature: coseSignature,
    };
  }
}
