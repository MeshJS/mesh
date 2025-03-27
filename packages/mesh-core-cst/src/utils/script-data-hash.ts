/* eslint-disable unicorn/number-literal-case */
import { Cardano, Serialization } from "@cardano-sdk/core";
import * as Crypto from "@cardano-sdk/crypto";
import { Hash32ByteBase16 } from "@cardano-sdk/crypto";
import { HexBlob } from "@cardano-sdk/util";

import { PlutusData } from "../types";

const CBOR_EMPTY_MAP = new Uint8Array([0xa0]);

/**
 * Computes the hash of script data in a transaction, including redeemers, datums, and cost models.
 *
 * This function takes arrays of redeemers and datums, along with cost models, and encodes
 * them in a CBOR (Concise Binary Object Representation) format. The encoded data is then
 * hashed using the Blake2b hashing algorithm to produce a 32-byte hash. This hash is
 * representative of the script data in a transaction on the Cardano blockchain.
 *
 * @param costModels The cost models for script execution.
 * @param redemeers The redeemers in the transaction. If not present or empty, the function may return undefined.
 * @param datums The datums in the transaction.
 * @returns The hashed script data, or undefined if no redeemers are provided.
 */
export const hashScriptData = (
  costModels: Serialization.Costmdls,
  redemeers?: Serialization.Redeemers,
  datums?: Serialization.CborSet<Cardano.PlutusData, PlutusData>,
): Crypto.Hash32ByteBase16 | undefined => {
  const writer = new Serialization.CborWriter();
  if (datums && datums.size() > 0 && (!redemeers || redemeers.size() === 0)) {
    /*
     ; Note that in the case that a transaction includes datums but does not
     ; include any redeemers, the script data format becomes (in hex):
     ; [ A0 | datums | A0 ]
     ; corresponding to a CBOR empty list and an empty map).
    */
    writer.writeEncodedValue(CBOR_EMPTY_MAP);
    writer.writeEncodedValue(Buffer.from(datums.toCbor(), "hex"));
    writer.writeEncodedValue(CBOR_EMPTY_MAP);
  } else {
    if (!redemeers || redemeers.size() === 0) return undefined;
    /*
     ; script data format:
     ; [ redeemers | datums | language views ]
     ; The redeemers are exactly the data present in the transaction witness set.
     ; Similarly for the datums, if present. If no datums are provided, the middle
     ; field is an empty string.
    */
    writer.writeEncodedValue(Buffer.from(redemeers.toCbor(), "hex"));
    if (datums && datums.size() > 0) {
      writer.writeEncodedValue(Buffer.from(datums.toCbor(), "hex"));
    }
    writer.writeEncodedValue(
      Buffer.from(costModels.languageViewsEncoding(), "hex"),
    );
  }

  return Hash32ByteBase16.fromHexBlob(
    HexBlob.fromBytes(
      Crypto.blake2b(Crypto.blake2b.BYTES).update(writer.encode()).digest(),
    ),
  );
};
