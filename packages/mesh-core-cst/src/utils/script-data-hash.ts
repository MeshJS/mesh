/* eslint-disable unicorn/number-literal-case */
import { Serialization } from "@cardano-sdk/core";
import * as Crypto from "@cardano-sdk/crypto";
import { Hash32ByteBase16 } from "@cardano-sdk/crypto";
import { HexBlob } from "@cardano-sdk/util";

const CBOR_EMPTY_MAP = new Uint8Array([0xa0]);

/**
 * Encodes redeemers into CBOR format according to CDDL specification.
 *
 * {+ [tag : redeemer_tag, index : uint .size 4] => [data : plutus_data, ex_units : ex_units]}
 *
 * The list of redeemers is turned into a CBOR map, where each redeemer is represented as a
 * map from [redeemer_tag, index] to [data, ex_units].
 *
 * @param redeemers
 * @returns
 */
const getCborEncodedRedeemers = (
  redeemers: Serialization.Redeemer[],
): Uint8Array => {
  const writer = new Serialization.CborWriter();
  writer.writeStartMap(redeemers.length);
  for (const redeemer of redeemers) {
    writer.writeStartArray(2);
    writer.writeInt(BigInt(redeemer.tag()));
    writer.writeInt(redeemer.index());
    writer.writeStartArray(2);
    writer.writeEncodedValue(Buffer.from(redeemer.data().toCbor(), "hex"));
    writer.writeEncodedValue(Buffer.from(redeemer.exUnits().toCbor(), "hex"));
  }
  return writer.encode();
};

/**
 * Encodes datums into CBOR format according to CDDL specification.
 *
 * nonempty_set<plutus_data>
 *
 * nonempty_set<a0> = #6.258([+ a0])
 *
 * The list of datums is turned into a CBOR set, represented by the CBOR tag 258.
 * The datums are serialised as an indefinite length array
 *
 * @param datums
 * @returns
 */
const getCborEncodedDatums = (
  datums: Serialization.PlutusData[],
): Uint8Array => {
  const writer = new Serialization.CborWriter();
  writer.writeTag(258);
  writer.writeStartArray();
  for (const datum of datums) {
    writer.writeEncodedValue(Buffer.from(datum.toCbor(), "hex"));
  }
  writer.writeEndArray();
  return writer.encode();
};

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
  redemeers?: Serialization.Redeemer[],
  datums?: Serialization.PlutusData[],
): Crypto.Hash32ByteBase16 | undefined => {
  const writer = new Serialization.CborWriter();
  if (datums && datums.length > 0 && (!redemeers || redemeers.length === 0)) {
    /*
     ; Note that in the case that a transaction includes datums but does not
     ; include any redeemers, the script data format becomes (in hex):
     ; [ A0 | datums | A0 ]
     ; corresponding to a CBOR empty list and an empty map).
    */
    writer.writeEncodedValue(CBOR_EMPTY_MAP);
    writer.writeEncodedValue(getCborEncodedDatums(datums));
    writer.writeEncodedValue(CBOR_EMPTY_MAP);
  } else {
    if (!redemeers || redemeers.length === 0) return undefined;
    /*
     ; script data format:
     ; [ redeemers | datums | language views ]
     ; The redeemers are exactly the data present in the transaction witness set.
     ; Similarly for the datums, if present. If no datums are provided, the middle
     ; field is an empty string.
    */
    writer.writeEncodedValue(getCborEncodedRedeemers(redemeers));

    if (datums && datums.length > 0) {
      writer.writeEncodedValue(getCborEncodedDatums(datums));
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
