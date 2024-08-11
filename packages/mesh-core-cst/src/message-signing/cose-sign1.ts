import { Buffer } from "buffer";
import { blake2b } from "blakejs";

import { StricaDecoder, StricaEncoder, StricaPublicKey } from "../stricahq";

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
    const decoded = StricaDecoder.decode(Buffer.from(cbor, "hex"));

    if (!(decoded.value instanceof Array)) throw Error("Invalid CBOR");
    if (decoded.value.length !== 4) throw Error("Invalid COSE_SIGN1");

    let protectedMap;
    // Decode and Set ProtectedMap
    const protectedSerialized = decoded.value[0];
    try {
      protectedMap = StricaDecoder.decode(protectedSerialized).value;
      if (!(protectedMap instanceof Map)) {
        throw Error();
      }
    } catch (error) {
      throw Error("Invalid protected");
    }

    // Set UnProtectedMap
    const unProtectedMap = decoded.value[1];
    if (!(unProtectedMap instanceof Map)) throw Error("Invalid unprotected");

    // Set Payload
    const payload = decoded.value[2];

    // Set Signature
    const signature = decoded.value[3];

    return new CoseSign1({
      protectedMap,
      unProtectedMap,
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

    const publicKey = new StricaPublicKey(publicKeyBuffer);

    return publicKey.verify(
      this.signature,
      this.createSigStructure(externalAad),
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
