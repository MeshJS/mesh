import { Buffer } from "buffer";
import {
  Cbor,
  isRawCborArray,
  isRawCborMap,
  RawCborArray,
  RawCborBytes,
  RawCborMap,
} from "@harmoniclabs/cbor";
import { blake2b } from "blakejs";

import { StricaDecoder, StricaEncoder } from "../stricahq";
import { Ed25519PublicKey, Ed25519Signature, HexBlob } from "../types";

class CoseSign1 {
  private protectedMap: Map<any, any>;

  private unProtectedMap: Map<any, any>;

  private payload: Buffer | null;

  private signature: Buffer | undefined;

  constructor(payload: {
    protectedMap: Map<any, any>;
    unProtectedMap: Map<any, any>;
    payload: Buffer | null;
    signature?: Buffer;
  }) {
    this.protectedMap = payload.protectedMap;
    this.unProtectedMap = payload.unProtectedMap;
    this.payload = payload.payload;

    if (this.unProtectedMap.get("hashed") == null) {
      this.unProtectedMap.set("hashed", false);
    }

    this.signature = payload.signature;
  }

  static fromCbor(cbor: string) {
    const decoded = Cbor.parse(cbor).toRawObj() as RawCborArray;
    if (!isRawCborArray(decoded)) throw Error("Invalid CBOR");
    if (decoded.array.length !== 4) throw Error("Invalid COSE_SIGN1");

    let protectedMap;
    // Decode and Set ProtectedMap
    const protectedSerialized = decoded.array[0] as RawCborBytes;
    try {
      protectedMap = Cbor.parse(
        protectedSerialized.bytes,
      ).toRawObj() as RawCborMap;
      if (!isRawCborMap(protectedMap)) {
        throw Error();
      }
    } catch (error) {
      throw Error("Invalid protected");
    }
    const newProtectedMap = new Map();
    protectedMap.map.forEach((value, _) => {
      newProtectedMap.set(
        Object.values(value.k)[0],
        Object.keys(value.v)[0] === "bytes"
          ? Buffer.from(Object.values(value.v)[0])
          : Object.values(value.v)[0],
      );
    });
    // Set UnProtectedMap
    let unProtectedMap = decoded.array[1] as RawCborMap;
    if (!isRawCborMap(unProtectedMap)) throw Error("Invalid unprotected");
    const newUnProtectedMap = new Map();
    unProtectedMap.map.forEach((value, _) => {
      newUnProtectedMap.set(
        Object.values(value.k)[0],
        Object.keys(value.v)[0] === "bytes"
          ? Buffer.from(Object.values(value.v)[0])
          : Object.values(value.v)[0],
      );
    });
    // Set Payload
    const payload = Buffer.from((decoded.array[2] as RawCborBytes).bytes);

    // Set Signature
    const signature = Buffer.from((decoded.array[3] as RawCborBytes).bytes);

    return new CoseSign1({
      protectedMap: newProtectedMap,
      unProtectedMap: newUnProtectedMap,
      payload,
      signature,
    });
  }

  createSigStructure(externalAad = Buffer.alloc(0)): Buffer {
    let protectedSerialized = Buffer.alloc(0);

    if (this.protectedMap.size !== 0) {
      protectedSerialized = StricaEncoder.encode(this.protectedMap);
    }

    const structure = [
      "Signature1",
      protectedSerialized,
      externalAad,
      this.payload,
    ];

    return StricaEncoder.encode(structure);
  }

  buildMessage(signature: Buffer): Buffer {
    this.signature = signature;

    let protectedSerialized = Buffer.alloc(0);
    if (this.protectedMap.size !== 0) {
      protectedSerialized = StricaEncoder.encode(this.protectedMap);
    }

    const coseSign1 = [
      protectedSerialized,
      this.unProtectedMap,
      this.payload,
      this.signature,
    ];

    return StricaEncoder.encode(coseSign1);
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
      new Ed25519Signature(this.signature),
      HexBlob(
        Buffer.from(this.createSigStructure(externalAad)).toString("hex"),
      ),
    );
  }

  hashPayload() {
    if (!this.unProtectedMap) throw Error("Invalid unprotected map");
    if (!this.payload) throw Error("Invalid payload");

    if (this.unProtectedMap.get("hashed"))
      throw Error("Payload already hashed");
    if (this.unProtectedMap.get("hashed") != false)
      throw Error("Invalid unprotected map");

    this.unProtectedMap.set("hashed", true);

    const hash = blake2b(this.payload, undefined, 24);
    this.payload = Buffer.from(hash);
  }

  getAddress(): Buffer {
    return this.protectedMap.get("address");
  }

  getPublicKey(): Buffer {
    return this.protectedMap.get(4);
  }

  getSignature(): Buffer | undefined {
    return this.signature;
  }

  getPayload(): Buffer | null {
    return this.payload;
  }
}

const getPublicKeyFromCoseKey = (cbor: string): Buffer => {
  const decodedCoseKey = StricaDecoder.decode(Buffer.from(cbor, "hex"));
  const publicKeyBuffer = decodedCoseKey.value.get(-2);

  if (publicKeyBuffer) {
    return publicKeyBuffer;
  }

  throw Error("Public key not found");
};

const getCoseKeyFromPublicKey = (cbor: string): Buffer => {
  const coseKeyMap = new Map();
  coseKeyMap.set(1, 1);
  coseKeyMap.set(3, -8);
  coseKeyMap.set(6, -2);
  coseKeyMap.set(-2, Buffer.from(cbor, "hex"));
  return StricaEncoder.encode(coseKeyMap);
};

export { CoseSign1, getPublicKeyFromCoseKey, getCoseKeyFromPublicKey };
