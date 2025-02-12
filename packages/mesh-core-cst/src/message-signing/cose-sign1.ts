import { Buffer } from "buffer";
import {
  Cbor,
  CborArray,
  CborBytes,
  CborMap,
  CborMapEntry,
  CborNegInt,
  CborSimple,
  CborText,
  CborUInt,
  isRawCborArray,
  isRawCborMap,
  RawCborArray,
  RawCborMap,
} from "@harmoniclabs/cbor";
import { blake2b } from "blakejs";
import JSONBig from "json-bigint";

import { Ed25519PublicKey, Ed25519Signature, HexBlob } from "../types";

class CoseSign1 {
  private protectedMap: CborMap;

  private unProtectedMap: CborMap;

  private payload: CborBytes | null;

  private signature: CborBytes | undefined;

  constructor(payload: {
    protectedMap: CborMap;
    unProtectedMap: CborMap;
    payload: CborBytes | null;
    signature?: CborBytes;
  }) {
    this.protectedMap = payload.protectedMap;
    this.unProtectedMap = payload.unProtectedMap;
    this.payload = payload.payload;

    if (
      !this.unProtectedMap.map.find((value) => {
        return (
          JSONBig.stringify(value.k) ===
          JSONBig.stringify(new CborText("hashed"))
        );
      })
    ) {
      this.unProtectedMap.map.push({
        k: new CborText("hashed"),
        v: new CborSimple(false),
      });
    }

    this.signature = payload.signature;
  }

  static fromCbor(cbor: string) {
    const decoded = Cbor.parse(cbor) as CborArray;
    if (!isRawCborArray(decoded.toRawObj() as RawCborArray))
      throw Error("Invalid CBOR");
    if (decoded.array.length !== 4) throw Error("Invalid COSE_SIGN1");

    let protectedMap: CborMap;
    // Decode and Set ProtectedMap
    const protectedSerialized = decoded.array[0] as CborBytes;
    try {
      protectedMap = Cbor.parse(protectedSerialized.bytes) as CborMap;
      if (!isRawCborMap(protectedMap.toRawObj() as RawCborMap)) {
        throw Error();
      }
    } catch (error) {
      throw Error("Invalid protected");
    }
    // Set UnProtectedMap
    let unProtectedMap = decoded.array[1] as CborMap;
    if (!isRawCborMap(unProtectedMap.toRawObj() as RawCborMap))
      throw Error("Invalid unprotected");
    // Set Payload
    const payload = decoded.array[2] as CborBytes;

    // Set Signature
    const signature = decoded.array[3] as CborBytes;

    return new CoseSign1({
      protectedMap,
      unProtectedMap,
      payload,
      signature,
    });
  }

  createSigStructure(externalAad = Buffer.alloc(0)): Buffer {
    let protectedSerialized = new CborBytes(Buffer.alloc(0));

    if (this.protectedMap.map.length !== 0) {
      protectedSerialized = new CborBytes(
        Cbor.encode(this.protectedMap).toBuffer(),
      );
    }

    if (!this.payload) throw Error("Invalid payload");

    const structure = new CborArray([
      new CborText("Signature1"),
      protectedSerialized,
      new CborBytes(externalAad),
      this.payload,
    ]);

    return Buffer.from(Cbor.encode(structure).toBuffer());
  }

  buildMessage(signature: Buffer): Buffer {
    this.signature = new CborBytes(signature);

    let protectedSerialized = new CborBytes(Buffer.alloc(0));
    if (this.protectedMap.map.length !== 0) {
      protectedSerialized = new CborBytes(
        Cbor.encode(this.protectedMap).toBuffer(),
      );
    }

    if (!this.payload) throw Error("Invalid payload");

    const coseSign1 = new CborArray([
      protectedSerialized,
      this.unProtectedMap,
      this.payload,
      this.signature,
    ]);

    return Buffer.from(Cbor.encode(coseSign1).toBuffer());
  }

  verifySignature({
    externalAad = Buffer.alloc(0),
    publicKeyBuffer,
  }: {
    externalAad?: Buffer;
    publicKeyBuffer?: Buffer;
  } = {}): boolean {
    if (!publicKeyBuffer) {
      publicKeyBuffer = this.getPublicKey();
    }

    if (!publicKeyBuffer) throw Error("Public key not found");
    if (!this.signature) throw Error("Signature not found");

    const publicKey = new Ed25519PublicKey(publicKeyBuffer);

    return publicKey.verify(
      new Ed25519Signature(this.signature.bytes),
      HexBlob(
        Buffer.from(this.createSigStructure(externalAad)).toString("hex"),
      ),
    );
  }

  hashPayload() {
    if (!this.unProtectedMap) throw Error("Invalid unprotected map");
    if (!this.payload) throw Error("Invalid payload");

    const hashedIndex = this.unProtectedMap.map.findIndex((value) => {
      return (
        JSONBig.stringify(value.k) === JSONBig.stringify(new CborText("hashed"))
      );
    });

    const hashed = this.unProtectedMap.map[hashedIndex];
    if (
      hashed &&
      JSONBig.stringify(hashed.v) === JSONBig.stringify(new CborSimple(true))
    )
      throw Error("Payload already hashed");
    if (
      hashed &&
      (JSONBig.stringify(hashed.v) ===
        JSONBig.stringify(new CborSimple(true))) !=
        false
    )
      throw Error("Invalid unprotected map");

    this.unProtectedMap.map.splice(hashedIndex, 1);

    const hash = blake2b(this.payload.bytes, undefined, 24);
    this.payload = new CborBytes(hash);
  }

  getAddress(): Buffer {
    const address = this.protectedMap.map.find((value) => {
      return (
        JSONBig.stringify(value.k) ===
        JSONBig.stringify(new CborText("address"))
      );
    });
    if (!address) throw Error("Address not found");
    return Buffer.from((address.v as CborBytes).bytes);
  }

  getPublicKey(): Buffer {
    const publicKey = this.protectedMap.map.find((value) => {
      return JSONBig.stringify(value.k) === JSONBig.stringify(new CborUInt(4));
    });
    if (!publicKey) throw Error("Public key not found");
    return Buffer.from((publicKey.v as CborBytes).bytes);
  }

  getSignature(): Buffer | undefined {
    return this.signature ? Buffer.from(this.signature.bytes) : this.signature;
  }

  getPayload(): Buffer | null {
    return this.payload ? Buffer.from(this.payload.bytes) : this.payload;
  }
}

const getPublicKeyFromCoseKey = (cbor: string): Buffer => {
  const decodedCoseKey = Cbor.parse(cbor) as CborMap;
  const publicKeyEntry = decodedCoseKey.map.find((value) => {
    return (
      JSONBig.stringify(value.k) ===
      JSONBig.stringify(new CborNegInt(BigInt(-2)))
    );
  });

  if (publicKeyEntry) {
    return Buffer.from((publicKeyEntry.v as CborBytes).bytes);
  }

  throw Error("Public key not found");
};

const getCoseKeyFromPublicKey = (cbor: string): Buffer => {
  const coseKeyMap: CborMapEntry[] = [];
  coseKeyMap.push({ k: new CborUInt(1), v: new CborUInt(1) });
  coseKeyMap.push({ k: new CborUInt(3), v: new CborNegInt(-8) });
  coseKeyMap.push({ k: new CborUInt(6), v: new CborNegInt(-2) });
  coseKeyMap.push({
    k: new CborNegInt(-2),
    v: new CborBytes(Buffer.from(cbor, "hex")),
  });
  return Buffer.from(Cbor.encode(new CborMap(coseKeyMap)).toBuffer());
};

export { CoseSign1, getPublicKeyFromCoseKey, getCoseKeyFromPublicKey };
