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

import { ISigner } from "../../interfaces/signer";
import { CoseSign1, getCoseKeyFromPublicKey } from "./cip-8";

export class CardanoSigner {
  constructor() {
    setInConwayEra(true);
  }

  static async signTx(
    tx: string,
    signers: ISigner[],
    returnFullTx = false,
  ): Promise<string> {
    const cardanoTx = Serialization.Transaction.fromCbor(
      Serialization.TxCBOR(tx),
    );
    const txHash = cardanoTx.body().hash();

    const vkeyWitnesses: [Ed25519PublicKeyHex, Ed25519SignatureHex][] = [];
    for (const signer of signers) {
      vkeyWitnesses.push([
        Ed25519PublicKeyHex(await signer.getPublicKey()),
        Ed25519SignatureHex(await signer.sign(HexBlob(txHash))),
      ]);
    }

    if (returnFullTx) {
      const txWitnessSet = cardanoTx.witnessSet();
      let witnessSetVkeys = txWitnessSet.vkeys();
      let witnessSetVkeysValues: [Ed25519PublicKeyHex, Ed25519SignatureHex][] =
        witnessSetVkeys
          ? [
              ...witnessSetVkeys.values().map((vkw) => vkw.toCore()),
              ...vkeyWitnesses,
            ]
          : vkeyWitnesses;
      txWitnessSet.setVkeys(
        Serialization.CborSet.fromCore(
          witnessSetVkeysValues,
          Serialization.VkeyWitness.fromCore,
        ),
      );
      return new Serialization.Transaction(
        cardanoTx.body(),
        txWitnessSet,
        cardanoTx.auxiliaryData(),
      ).toCbor();
    }

    const txWitnessSet = new Serialization.TransactionWitnessSet();
    txWitnessSet.setVkeys(
      Serialization.CborSet.fromCore(
        vkeyWitnesses,
        Serialization.VkeyWitness.fromCore,
      ),
    );

    return txWitnessSet.toCbor();
  }

  static async signData(
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
